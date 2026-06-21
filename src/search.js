// Умный поиск по каталогу: терпим к раскладке клавиатуры, транслиту и опечаткам.
//
// Покрывает три частые ситуации:
//  • не та раскладка: «cvtcbntkm» → «смеситель» (и наоборот);
//  • латиница вместо кириллицы (транслит): «smesitel», «akvalin»;
//  • опечатки: «смеситль», «ракавина» — допускается 1–2 правки на слово.
//
// Чистый модуль без зависимостей — покрыт тестами.

// Нормализация: нижний регистр, ё→е, схлопывание пробелов.
function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').trim()
}

// Раскладка ЙЦУКЕН ↔ QWERTY (одни и те же физические клавиши).
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,./"
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбю.'
const enToRuMap = {}
const ruToEnMap = {}
for (let i = 0; i < EN_KEYS.length; i++) {
  enToRuMap[EN_KEYS[i]] = RU_KEYS[i]
  ruToEnMap[RU_KEYS[i]] = EN_KEYS[i]
}
const swapLayout = (s, map) => s.replace(/./g, (ch) => map[ch] || ch)

// Транслитерация латиницы в кириллицу (фонетически). Многобуквенные сочетания
// раскрываем раньше одиночных.
const TRANSLIT_MULTI = [
  ['shch', 'щ'],
  ['sch', 'щ'],
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['yo', 'е'],
  ['yu', 'ю'],
  ['ya', 'я'],
]
const TRANSLIT_ONE = {
  a: 'а',
  b: 'б',
  c: 'к',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'й',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'к',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'ы',
  z: 'з',
}
function translit(s) {
  let out = s
  for (const [lat, cyr] of TRANSLIT_MULTI) out = out.split(lat).join(cyr)
  return out.replace(/[a-z]/g, (ch) => TRANSLIT_ONE[ch] || ch)
}

// Расстояние Левенштейна с ранним выходом при превышении лимита.
export function levenshtein(a, b, limit = Infinity) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > limit) return limit + 1
    prev = cur
  }
  return prev[b.length]
}

// Сколько правок допускаем для слова такой длины.
function maxEdits(len) {
  if (len <= 2) return 0
  if (len <= 5) return 1
  return 2
}

// Совпадает ли токен с текстом: точное вхождение или близкое по Левенштейну слово.
function tokenInText(hay, token, words) {
  if (!token) return true
  if (hay.includes(token)) return true
  const limit = maxEdits(token.length)
  if (limit === 0) return false
  return words.some(
    (w) => Math.abs(w.length - token.length) <= limit && levenshtein(w, token, limit) <= limit,
  )
}

// Все слова варианта запроса должны найтись в тексте.
function allTokensMatch(hay, words, variant) {
  const tokens = variant.split(/\s+/).filter(Boolean)
  return tokens.every((t) => tokenInText(hay, t, words))
}

// Варианты запроса: исходный + смена раскладки в обе стороны + транслит.
function queryVariants(q) {
  return [...new Set([q, swapLayout(q, enToRuMap), swapLayout(q, ruToEnMap), translit(q)])].filter(
    Boolean,
  )
}

// Текст товара, по которому ищем.
export function searchableText(p) {
  return [p?.name, p?.description, p?.sku, p?.brand].filter(Boolean).join(' ')
}

// Главная функция: подходит ли текст под запрос.
export function matchesQuery(text, query) {
  const q = normalize(query)
  if (!q) return true
  const hay = normalize(text)
  const words = hay.split(/[^a-zа-я0-9]+/).filter(Boolean)
  return queryVariants(q).some((v) => allTokensMatch(hay, words, v))
}
