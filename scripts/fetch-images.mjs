// Самохостинг фото товаров. Тянет CSV из Google-таблицы (VITE_SHEET_CSV_URL),
// скачивает картинки в public/img/ (оптимизированный WebP через weserv — тот же
// трансформ, что отдаёт сайт), нумеруя выжившие подряд по товару: <id>-<n>.webp.
// Мёртвые/недоступные исходники пропускает, чтобы галерея не начиналась с битого
// кадра. В конце печатает готовые строки для колонки images таблицы и список
// мёртвых ссылок.
//
// Запуск:
//   npm run fetch:images                 — скачать
//   npm run fetch:images -- --dry-run    — только отчёт, без записи файлов/таблицы
//   npm run fetch:images -- --push       — скачать И проставить пути в таблицу
//   npm run fetch:images -- --push --dry-run — превью правок таблицы, без записи
//
// Это dev-инструмент (в Docker-сборке не участвует): гоняем локально при
// пополнении каталога, файлы public/img/ коммитим. optimizeImageUrl относительные
// пути не трогает — поэтому повторный прогон над таблицей с /img/... путями ничего
// не качает и не перезаписывает (идемпотентно).
//
// --push пишет колонку images через Google Sheets API (сервис-аккаунт): нужны
// GOOGLE_APPLICATION_CREDENTIALS (путь к JSON-ключу) и SHEETS_SPREADSHEET_ID в
// .env, а таблица — расшарена сервис-аккаунту как «Редактор». См. README.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import Papa from 'papaparse'
import { sheetRowsToCatalog } from '../src/catalog-source.js'
import { optimizeImageUrl } from '../src/image-url.js'
import {
  getAccessToken,
  firstTabTitle,
  getValues,
  batchUpdate,
  columnLetter,
} from './lib/sheets.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const PUSH = process.argv.includes('--push')
const OUT_DIR = new URL('../public/img/', import.meta.url)
const TIMEOUT_MS = 15_000

// Node не читает .env сам (в Docker переменная приходит из ENV) — подгружаем.
try {
  if (!process.env.VITE_SHEET_CSV_URL) process.loadEnvFile('.env')
} catch {
  /* .env может не быть — тогда полагаемся на process.env */
}
const SHEET_URL = process.env.VITE_SHEET_CSV_URL

if (!SHEET_URL) {
  console.error('[fetch-images] VITE_SHEET_CSV_URL не задан (ни в окружении, ни в .env). Прерываю.')
  process.exit(1)
}

async function loadProducts() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const res = await fetch(SHEET_URL, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { data } = Papa.parse(await res.text(), { header: true, skipEmptyLines: true })
  return sheetRowsToCatalog(data).products
}

// Уже локальный путь → приводим к /img/<файл>, если такой файл есть в public/img
// (чинит опечатки ручного ввода: «public/img/x.webp», голое «x.webp»). Чужой/
// неизвестный путь не трогаем.
function normalizeLocal(src) {
  const base = src.trim().split('/').pop()
  if (base && existsSync(new URL(base, OUT_DIR))) return `/img/${base}`
  return src
}

// Возвращает { skip } для уже локальных путей или { buf } со скачанным WebP.
async function fetchImage(src) {
  const url = optimizeImageUrl(src, { provider: 'weserv' })
  if (!/^https?:\/\//i.test(url)) return { skip: true }
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 100) throw new Error(`подозрительно мал (${buf.length} б)`)
  return { buf }
}

const products = await loadProducts()
if (!DRY_RUN) mkdirSync(OUT_DIR, { recursive: true })

let saved = 0
let bytes = 0
let alreadyLocal = 0
const dead = []
const paste = []

for (const p of products) {
  const files = []
  for (const src of p.images) {
    try {
      const r = await fetchImage(src)
      if (r.skip) {
        alreadyLocal++
        files.push(normalizeLocal(src))
        continue
      }
      const file = `${p.id}-${files.length + 1}.webp`
      if (!DRY_RUN) writeFileSync(new URL(file, OUT_DIR), r.buf)
      saved++
      bytes += r.buf.length
      files.push(`/img/${file}`)
    } catch (e) {
      dead.push({ id: p.id, src, err: e.message || String(e) })
    }
  }
  paste.push({ id: p.id, images: files })
}

console.log(
  `[fetch-images]${DRY_RUN ? ' (dry-run)' : ''} товаров ${products.length}, ` +
    `скачано ${saved} (${(bytes / 1024 / 1024).toFixed(2)} МБ)` +
    (alreadyLocal ? `, уже локальных ${alreadyLocal}` : '') +
    `, мёртвых ссылок ${dead.length}.`,
)
for (const d of dead) console.log(`  ✗ id ${d.id} [${d.err}] ${d.src}`)

console.log('\nСтроки для колонки images таблицы (по id товара):')
for (const row of paste) console.log(`  ${row.id}\t${row.images.join('|')}`)

// --push: проставляем полученные /img/... пути прямо в колонку images таблицы.
if (PUSH) {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID
  if (!keyPath || !spreadsheetId) {
    console.error(
      '\n[fetch-images] --push требует GOOGLE_APPLICATION_CREDENTIALS (путь к ключу сервис-аккаунта) и SHEETS_SPREADSHEET_ID в .env. См. README.',
    )
    process.exit(1)
  }

  const token = await getAccessToken(keyPath)
  const tab = process.env.SHEETS_TAB || (await firstTabTitle(spreadsheetId, token))
  const rows = await getValues(spreadsheetId, tab, token)
  const header = rows[0] || []
  const idCol = header.indexOf('id')
  const imgCol = header.indexOf('images')
  if (idCol === -1 || imgCol === -1) {
    console.error(`\n[fetch-images] В листе "${tab}" в первой строке нет колонок id и/или images.`)
    process.exit(1)
  }

  // id → { номер строки (1-based), текущее значение images }
  const rowById = new Map()
  for (let i = 1; i < rows.length; i++) {
    const id = (rows[i]?.[idCol] ?? '').toString().trim()
    if (id) rowById.set(id, { rowNumber: i + 1, current: (rows[i]?.[imgCol] ?? '').toString() })
  }

  const updates = []
  const missing = []
  for (const row of paste) {
    if (!row.images.length) continue
    const target = rowById.get(String(row.id))
    if (!target) {
      missing.push(row.id)
      continue
    }
    const value = row.images.join('|')
    if (value === target.current) continue // уже проставлено — не трогаем
    updates.push({ range: `'${tab}'!${columnLetter(imgCol)}${target.rowNumber}`, value })
  }

  console.log(
    `\n[fetch-images] Лист "${tab}": к обновлению ${updates.length} строк${DRY_RUN ? ' (dry-run — не пишу)' : ''}.`,
  )
  for (const u of updates) console.log(`  ${u.range} = ${u.value}`)
  if (missing.length) console.log(`  (id без строки в таблице, пропущены: ${missing.join(', ')})`)

  if (!DRY_RUN && updates.length) {
    const { updated } = await batchUpdate(spreadsheetId, updates, token)
    console.log(`[fetch-images] Записано ячеек: ${updated}.`)
  }
}
