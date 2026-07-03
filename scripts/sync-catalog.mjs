// Синк снапшота каталога на сборке. Делает две вещи:
//   1) тянет CSV из Google-таблицы (VITE_SHEET_CSV_URL) и перезаписывает
//      public/products.json — чтобы фолбэк каталога (когда таблица недоступна в
//      рантайме) отдавал СВЕЖИЕ данные, а не демо;
//   2) генерирует товарные <url> в public/sitemap.xml из финального products.json
//      — иначе карточки товаров (главные для органики) не попадают в карту сайта.
// Запускается в Dockerfile ПЕРЕД `vite build`, поэтому и снапшот, и sitemap в
// образе всегда актуальны.
//
// Скрипт НАМЕРЕННО не валит сборку: если таблица недоступна/пуста/битая — просто
// предупреждаем и оставляем прежний public/products.json (последний рабочий
// снапшот). Иначе сбой Google рушил бы деплой или затирал каталог. Sitemap тоже
// строится из того, что реально уедет в образ, независимо от доступности таблицы.
import { readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { sheetRowsToCatalog } from '../src/catalog-source.js'
import { injectProductUrls } from './sitemap.mjs'

const SHEET_URL = process.env.VITE_SHEET_CSV_URL
const PRODUCTS = new URL('../public/products.json', import.meta.url)
const SITEMAP = new URL('../public/sitemap.xml', import.meta.url)
const TIMEOUT_MS = 15_000

function keepExisting(reason) {
  let count = '?'
  try {
    count = JSON.parse(readFileSync(PRODUCTS, 'utf8')).products?.length ?? '?'
  } catch {
    /* файла нет — это ок, в сборке он есть в public/ */
  }
  console.warn(
    `[sync-catalog] ${reason}. Оставляю текущий public/products.json (товаров: ${count}).`,
  )
}

// 1) Обновление products.json из таблицы (если задан адрес). Ошибки/пустой ответ
//    не роняют сборку — оставляем прежний снапшот.
async function syncProducts() {
  if (!SHEET_URL) {
    console.log(
      '[sync-catalog] VITE_SHEET_CSV_URL не задан — синк products.json пропущен, файл берётся как есть.',
    )
    return
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
      return
    }

    writeFileSync(PRODUCTS, JSON.stringify(catalog, null, 2) + '\n')
    console.log(
      `[sync-catalog] Обновлён public/products.json: товаров ${catalog.products.length}, категорий ${catalog.categories.length}.`,
    )
  } catch (e) {
    keepExisting(`Не удалось получить таблицу: ${e.message || e}`)
  }
}

// 2) Генерация товарных URL в sitemap.xml из ФИНАЛЬНОГО products.json (что бы там
//    ни оказалось — свежий синк или прежний снапшот). Чисто локальная операция —
//    не зависит от сети и тоже не валит сборку.
function syncSitemap() {
  try {
    const products = JSON.parse(readFileSync(PRODUCTS, 'utf8')).products || []
    const xml = injectProductUrls(readFileSync(SITEMAP, 'utf8'), products)
    writeFileSync(SITEMAP, xml)
    const count = (xml.match(/<loc>[^<]*\/product\//g) || []).length
    console.log(`[sync-catalog] Обновлён public/sitemap.xml: товарных URL ${count}.`)
  } catch (e) {
    console.warn(
      `[sync-catalog] Не удалось обновить sitemap.xml: ${e.message || e}. Оставляю как есть.`,
    )
  }
}

await syncProducts()
syncSitemap()
