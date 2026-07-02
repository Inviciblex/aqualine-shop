import { useCallback, useEffect, useState } from 'react'
import { rowToProduct } from './catalog-parse.js'
import { optimizeImages } from './image-url.js'

/**
 * Загрузка каталога. Два источника на выбор (без правки кода):
 *
 *  1) Google Таблица (удобнее всего для не-программиста).
 *     Укажите в .env адрес опубликованного CSV:
 *        VITE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/XXXX/export?format=csv
 *     Подробный гайд по колонкам — в README, раздел «Товары в Google Таблице».
 *
 *  2) Файл public/products.json (по умолчанию, если адрес таблицы не задан).
 *     Лежит рядом с сайтом, правится на сервере без пересборки.
 *
 * Возвращает: { categories, products, status }  где status: loading | ready | error
 */

const SHEET_URL = import.meta.env.VITE_SHEET_CSV_URL

// Оптимизация фото через image-proxy. Включается, если задан VITE_IMG_PROXY
// (значение = имя провайдера, сейчас поддержан 'weserv'). Пусто → фото берутся
// как есть. Применяется к обоим источникам каталога (таблица и products.json).
const IMG_PROXY = import.meta.env.VITE_IMG_PROXY
// Любое непустое значение включает оптимизацию; конкретный провайдер — по имени
// ('weserv'), а простые «1/true/on» трактуем как weserv (единственный сейчас).
const IMG_PROVIDER = IMG_PROXY
  ? ['1', 'true', 'on'].includes(String(IMG_PROXY).toLowerCase())
    ? 'weserv'
    : String(IMG_PROXY)
  : ''
function withOptimizedImages(result) {
  if (!IMG_PROVIDER) return result
  return {
    ...result,
    products: result.products.map((p) => ({
      ...p,
      images: optimizeImages(p.images, { provider: IMG_PROVIDER }),
    })),
  }
}

async function loadFromSheet() {
  // Papa Parse нужен только при источнике Google-таблица. Грузим его динамически,
  // чтобы CSV-парсер не попадал в основной бандл, когда используется products.json.
  const { default: Papa } = await import('papaparse')
  return new Promise((resolve, reject) => {
    Papa.parse(SHEET_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const products = res.data.map(rowToProduct).filter((p) => p.name && p.sku)
        const categories = [...new Set(products.map((p) => p.category).filter(Boolean))]
        resolve({ products, categories })
      },
      error: reject,
    })
  })
}

async function loadFromJson() {
  const url = `${import.meta.env.BASE_URL}products.json`
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return {
    categories: Array.isArray(json.categories) ? json.categories : [],
    products: Array.isArray(json.products) ? json.products : [],
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
    const loader = SHEET_URL ? loadFromSheet() : loadFromJson()

    loader
      .then((result) => {
        if (cancelled) return
        setData(withOptimizedImages(result))
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
