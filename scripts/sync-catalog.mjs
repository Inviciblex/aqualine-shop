// Синк снапшота каталога: тянет CSV из Google-таблицы (VITE_SHEET_CSV_URL) и
// перезаписывает public/products.json — чтобы фолбэк каталога (когда таблица
// недоступна в рантайме) отдавал СВЕЖИЕ данные, а не демо. Запускается в
// Dockerfile ПЕРЕД `vite build`, поэтому снапшот в образе всегда актуален.
//
// Скрипт НАМЕРЕННО не валит сборку: если таблица недоступна/пуста/битая — просто
// предупреждаем и оставляем прежний public/products.json (последний рабочий
// снапшот). Иначе сбой Google рушил бы деплой или затирал каталог.
import { readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { sheetRowsToCatalog } from '../src/catalog-source.js'

const SHEET_URL = process.env.VITE_SHEET_CSV_URL
const OUT = new URL('../public/products.json', import.meta.url)
const TIMEOUT_MS = 15_000

function keepExisting(reason) {
  let count = '?'
  try {
    count = JSON.parse(readFileSync(OUT, 'utf8')).products?.length ?? '?'
  } catch {
    /* файла нет — это ок, в сборке он есть в public/ */
  }
  console.warn(
    `[sync-catalog] ${reason}. Оставляю текущий public/products.json (товаров: ${count}).`,
  )
}

if (!SHEET_URL) {
  console.log(
    '[sync-catalog] VITE_SHEET_CSV_URL не задан — синк пропущен, используется public/products.json как есть.',
  )
  process.exit(0)
}

try {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const res = await fetch(SHEET_URL, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const csv = await res.text()

  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true })
  const catalog = sheetRowsToCatalog(parsed.data)

  // Пустой результат обычно означает сбой публикации/доступа (например, вернулся
  // HTML-логин вместо CSV) — не затираем рабочий снапшот пустым.
  if (!catalog.products.length) {
    keepExisting('Таблица вернула 0 валидных товаров')
    process.exit(0)
  }

  writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n')
  console.log(
    `[sync-catalog] Обновлён public/products.json: товаров ${catalog.products.length}, категорий ${catalog.categories.length}.`,
  )
} catch (e) {
  keepExisting(`Не удалось получить таблицу: ${e.message || e}`)
  process.exit(0)
}
