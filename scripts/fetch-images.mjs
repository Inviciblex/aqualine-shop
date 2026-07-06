// Самохостинг фото товаров. Тянет CSV из Google-таблицы (VITE_SHEET_CSV_URL),
// скачивает картинки в public/img/ (оптимизированный WebP через weserv — тот же
// трансформ, что отдаёт сайт), нумеруя выжившие подряд по товару: <id>-<n>.webp.
// Мёртвые/недоступные исходники пропускает, чтобы галерея не начиналась с битого
// кадра. В конце печатает готовые строки для колонки images таблицы и список
// мёртвых ссылок.
//
// Запуск:
//   npm run fetch:images              — скачать
//   npm run fetch:images -- --dry-run — только отчёт, без записи файлов
//
// Это dev-инструмент (в Docker-сборке не участвует): гоняем локально при
// пополнении каталога, полученные пути вставляем в колонку images таблицы,
// файлы public/img/ коммитим. optimizeImageUrl относительные пути не трогает —
// поэтому повторный прогон над таблицей с /img/... путями ничего не качает.
import { writeFileSync, mkdirSync } from 'node:fs'
import Papa from 'papaparse'
import { sheetRowsToCatalog } from '../src/catalog-source.js'
import { optimizeImageUrl } from '../src/image-url.js'

const DRY_RUN = process.argv.includes('--dry-run')
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
        files.push(src)
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
