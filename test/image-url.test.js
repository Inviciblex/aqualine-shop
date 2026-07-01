// Тесты построения URL для image-proxy (src/image-url.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizeImageUrl, optimizeImages } from '../src/image-url.js'

test('weserv: оборачивает абсолютный https-URL, вписывает без кропа, webp', () => {
  const out = optimizeImageUrl('https://site.ru/1.jpg')
  assert.ok(out.startsWith('https://images.weserv.nl/?url='))
  assert.ok(out.includes(encodeURIComponent('https://site.ru/1.jpg')))
  assert.ok(out.includes('w=1200'))
  assert.ok(out.includes('h=1200'))
  assert.ok(out.includes('fit=inside')) // без кропа: квадрат остаётся квадратом
  assert.ok(out.includes('output=webp'))
})

test('кастомные размеры/качество прокидываются', () => {
  const out = optimizeImageUrl('https://site.ru/1.jpg', { width: 600, height: 450, quality: 70 })
  assert.ok(out.includes('w=600'))
  assert.ok(out.includes('h=450'))
  assert.ok(out.includes('q=70'))
})

test('http тоже оборачивается', () => {
  assert.ok(optimizeImageUrl('http://site.ru/1.jpg').startsWith('https://images.weserv.nl/'))
})

test('пустое/пробелы → возвращается как есть', () => {
  assert.equal(optimizeImageUrl(''), '')
  assert.equal(optimizeImageUrl('   '), '')
  assert.equal(optimizeImageUrl(null), '')
  assert.equal(optimizeImageUrl(undefined), '')
})

test('data: и относительные URL не трогаем', () => {
  assert.equal(optimizeImageUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
  assert.equal(optimizeImageUrl('/local/1.jpg'), '/local/1.jpg')
  assert.equal(optimizeImageUrl('1.jpg'), '1.jpg')
})

test('уже проксированный URL не оборачиваем повторно', () => {
  const once = optimizeImageUrl('https://site.ru/1.jpg')
  assert.equal(optimizeImageUrl(once), once)
})

test('неизвестный провайдер → URL как есть', () => {
  assert.equal(
    optimizeImageUrl('https://site.ru/1.jpg', { provider: 'nope' }),
    'https://site.ru/1.jpg',
  )
})

test('optimizeImages: массив маппится, не-массив возвращается как есть', () => {
  const out = optimizeImages(['https://site.ru/1.jpg', 'data:foo', ''])
  assert.ok(out[0].startsWith('https://images.weserv.nl/'))
  assert.equal(out[1], 'data:foo')
  assert.equal(out[2], '')
  assert.equal(optimizeImages(null), null)
})
