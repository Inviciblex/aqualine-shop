import { test } from 'node:test'
import assert from 'node:assert/strict'
import { injectProductUrls } from '../scripts/sitemap.mjs'

const TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ваш-домен.ру/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://ваш-домен.ру/contacts</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
`

test('injectProductUrls: добавляет товарные URL на домене шаблона перед </urlset>', () => {
  const out = injectProductUrls(TEMPLATE, [{ id: 1 }, { id: 2 }])
  assert.match(out, /<loc>https:\/\/ваш-домен\.ру\/product\/1<\/loc>/)
  assert.match(out, /<loc>https:\/\/ваш-домен\.ру\/product\/2<\/loc>/)
  // Информационные страницы не тронуты.
  assert.match(out, /<loc>https:\/\/ваш-домен\.ру\/contacts<\/loc>/)
  // Товарные URL — внутри urlset, до закрывающего тега.
  assert.ok(out.trimEnd().endsWith('</urlset>'))
  assert.ok(out.indexOf('/product/2') < out.indexOf('</urlset>'))
})

test('injectProductUrls: идемпотентна (повторный прогон не дублирует)', () => {
  const once = injectProductUrls(TEMPLATE, [{ id: 1 }, { id: 2 }])
  const twice = injectProductUrls(once, [{ id: 1 }, { id: 2 }])
  assert.equal(twice, once)
  assert.equal((twice.match(/\/product\/1</g) || []).length, 1)
})

test('injectProductUrls: обновляет набор товаров при повторном прогоне', () => {
  const first = injectProductUrls(TEMPLATE, [{ id: 1 }, { id: 2 }])
  const second = injectProductUrls(first, [{ id: 3 }])
  assert.doesNotMatch(second, /\/product\/1</)
  assert.doesNotMatch(second, /\/product\/2</)
  assert.match(second, /\/product\/3</)
})

test('injectProductUrls: без валидного домена в шаблоне не трогает файл', () => {
  const rel = '<urlset>\n  <url><loc>/contacts</loc></url>\n</urlset>\n'
  assert.equal(injectProductUrls(rel, [{ id: 1 }]), rel)
})

test('injectProductUrls: пустой/битый список товаров не добавляет товарных URL', () => {
  assert.doesNotMatch(injectProductUrls(TEMPLATE, []), /\/product\//)
  assert.doesNotMatch(injectProductUrls(TEMPLATE, undefined), /\/product\//)
  // null-id и дубли отфильтровываются.
  const out = injectProductUrls(TEMPLATE, [{ id: null }, { id: 5 }, { id: 5 }, null])
  assert.equal((out.match(/\/product\//g) || []).length, 1)
  assert.match(out, /\/product\/5</)
})
