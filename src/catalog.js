import { useCallback, useEffect, useState } from 'react'
import {
  resolveImgProvider,
  withOptimizedImages,
  normalizeJson,
  resolveCatalog,
  sheetRowsToCatalog,
} from './catalog-source.js'

/**
 * Загрузка каталога. Два источника на выбор (без правки кода):
 *
 *  1) Google Таблица (удобнее всего для не-программиста).
 *     Укажите в .env адрес опубликованного CSV:
 *        VITE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/XXXX/export?format=csv
 *     Подробный гайд по колонкам — в README, раздел «Товары в Google Таблице».
 *
 *  2) Файл public/products.json — по умолчанию (если адрес таблицы не задан) И
 *     как страховка: если таблица недоступна (сеть/таймаут/Google лёг), каталог
 *     откатывается на этот снапшот, а не роняет магазин. Держите его актуальным.
 *
 * Возвращает: { categories, products, status }  где status: loading | ready | error
 */

const SHEET_URL = import.meta.env.VITE_SHEET_CSV_URL
const IMG_PROVIDER = resolveImgProvider(import.meta.env.VITE_IMG_PROXY)
// Таймаут на загрузку: внешняя таблица/сеть может зависнуть — не оставляем
// каталог в вечном «Загрузка…», а переводим в error (там есть «Повторить»).
const LOAD_TIMEOUT_MS = 12_000

async function loadFromSheet() {
  // Papa Parse нужен только при источнике Google-таблица. Грузим его динамически,
  // чтобы CSV-парсер не попадал в основной бандл, когда используется products.json.
  const { default: Papa } = await import('papaparse')
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) reject(new Error('sheet-timeout'))
    }, LOAD_TIMEOUT_MS)
    Papa.parse(SHEET_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        done = true
        clearTimeout(timer)
        resolve(sheetRowsToCatalog(res.data))
      },
      error: (err) => {
        done = true
        clearTimeout(timer)
        reject(err)
      },
    })
  })
}

async function loadFromJson() {
  const url = `${import.meta.env.BASE_URL}products.json`
  // AbortController + таймаут: зависший запрос не держит каталог в «Загрузка…».
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return normalizeJson(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

export function useCatalog() {
  const [data, setData] = useState({ categories: [], products: [] })
  const [status, setStatus] = useState('loading')
  // reloadKey меняется по reload() → эффект перезапускает загрузку (кнопка
  // «Повторить» при сетевом сбое, чтобы не перезагружать всю страницу).
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    // Таблица (если задана) с откатом на products.json при сбое — магазин
    // продолжает работать на снапшоте, а не уходит целиком в error-state.
    const loader = resolveCatalog({
      sheetUrl: SHEET_URL,
      loadSheet: loadFromSheet,
      loadJson: loadFromJson,
      warn: console.warn,
    })

    loader
      .then((result) => {
        if (cancelled) return
        setData(withOptimizedImages(result, IMG_PROVIDER))
        setStatus('ready')
      })
      .catch((e) => {
        console.error('Не удалось загрузить каталог:', e)
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { ...data, status, reload }
}
