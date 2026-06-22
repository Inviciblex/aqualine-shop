import { useEffect, useState } from 'react'
import { rowToProduct } from './catalog-parse.js'

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

  useEffect(() => {
    let cancelled = false
    const loader = SHEET_URL ? loadFromSheet() : loadFromJson()

    loader
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('ready')
      })
      .catch((e) => {
        console.error('Не удалось загрузить каталог:', e)
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { ...data, status }
}
