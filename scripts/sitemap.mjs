// Генерация товарных <url> в sitemap.xml на сборке. Чистая строковая функция
// (без fs/сети) — покрыта юнит-тестом в test/sitemap.test.js.
//
// Домен берём из первого <loc> шаблона, чтобы товарные URL были на том же домене,
// что и информационные страницы: до запуска это плейсхолдер (https://ваш-домен.ру),
// после замены домена в public/sitemap.xml — реальный. Если валидного домена в
// шаблоне нет, товарные URL не добавляем (не плодим битые/относительные ссылки).
//
// Идемпотентна: ранее вставленные товарные <url> вычищаются перед вставкой свежих,
// поэтому повторный прогон (например, локально) не дублирует записи.

// Блок одного товарного <url> (по /product/ в <loc>) — для очистки перед вставкой.
const PRODUCT_URL_BLOCK = /[ \t]*<url>\s*<loc>[^<]*\/product\/[^<]*<\/loc>[\s\S]*?<\/url>\n?/g

export function injectProductUrls(xml, products) {
  const origin = (xml.match(/<loc>(https?:\/\/[^/<]+)/) || [])[1]
  if (!origin) return xml // нет валидного домена в шаблоне — не трогаем файл

  const base = xml.replace(PRODUCT_URL_BLOCK, '')
  const ids = [...new Set((products || []).map((p) => p && p.id).filter((id) => id != null))]
  if (!ids.length) return base

  const entries = ids
    .map(
      (id) =>
        `  <url>\n    <loc>${origin}/product/${id}</loc>\n` +
        `    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    )
    .join('\n')

  return base.replace(/\n*<\/urlset>\s*$/, '\n' + entries + '\n</urlset>\n')
}
