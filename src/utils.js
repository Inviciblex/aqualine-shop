// Форматирование цены: 4990 → "4 990 ₽"
export function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU').format(value) + ' ₽'
}

// Иконки категорий (рисуются для заглушек товаров без фото).
// Возвращают строку с SVG-путями внутри одинаковой viewBox.
const categoryIcons = {
  Смесители:
    '<path d="M14 30 V18 a6 6 0 0 1 6-6 h10" /><path d="M30 12 v8" /><path d="M30 20 h8 v6" /><path d="M38 26 v4" /><path d="M11 30 h6" />',
  'Раковины и мойки':
    '<path d="M10 20 h28 v6 a10 10 0 0 1 -10 10 h-8 a10 10 0 0 1 -10 -10 z" /><path d="M24 12 v8" /><circle cx="24" cy="30" r="2.5" />',
  'Фильтры и очистка воды': '<path d="M11 13 H37 L26 27 V37 H22 V27 Z" />',
  'Комплектующие и фурнитура':
    '<path d="M24 11 L35 17.5 V30.5 L24 37 L13 30.5 V17.5 Z" /><circle cx="24" cy="24" r="5" />',
  Раковины:
    '<path d="M10 20 h28 v6 a10 10 0 0 1 -10 10 h-8 a10 10 0 0 1 -10 -10 z" /><path d="M24 12 v8" /><circle cx="24" cy="30" r="2.5" />',
  Унитазы:
    '<path d="M14 12 h20 v6 h-20 z" /><path d="M16 18 v4 a10 10 0 0 0 16 0 v-4" /><path d="M20 30 l-2 6 h12 l-2 -6" />',
  'Душевые системы':
    '<path d="M16 12 v8" /><path d="M16 20 h14 a6 6 0 0 1 6 6 v2" /><path d="M30 28 h12" /><path d="M33 33 v3 M36 33 v4 M39 33 v3" />',
  Ванны:
    '<path d="M10 22 h28 v6 a8 8 0 0 1 -8 8 h-12 a8 8 0 0 1 -8 -8 z" /><path d="M14 22 v-6 a4 4 0 0 1 8 0" /><circle cx="18" cy="16" r="1.6" />',
  Полотенцесушители:
    '<rect x="16" y="10" width="16" height="28" rx="2" /><path d="M20 16 h8 M20 22 h8 M20 28 h8" />',
  'Трубы и фитинги':
    '<path d="M10 28 h12 v-8 h8 v-8 h8" /><path d="M10 24 v8 M14 24 v8" /><path d="M34 8 v8 M38 8 v8" />',
}

export function getCategoryIconPaths(category) {
  return (
    categoryIcons[category] ||
    '<path d="M13 13 H27 L39 25 L27 37 L13 25 Z" /><circle cx="20" cy="20" r="2.5" />'
  )
}

// ── Телефон ──
// Маска для поля ввода: показывает +7 (XXX) XXX-XX-XX по мере набора.
export function formatPhoneInput(raw) {
  let digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  // 8XXXXXXXXXX или 7XXXXXXXXXX → нормализуем первую цифру к 7
  if (digits[0] === '8') digits = '7' + digits.slice(1)
  if (digits[0] !== '7') digits = '7' + digits
  digits = digits.slice(0, 11) // 7 + 10 цифр
  const a = digits.slice(1, 4)
  const b = digits.slice(4, 7)
  const c = digits.slice(7, 9)
  const d = digits.slice(9, 11)
  let out = '+7'
  if (a) out += ` (${a}`
  if (a.length === 3) out += ')'
  if (b) out += ` ${b}`
  if (c) out += `-${c}`
  if (d) out += `-${d}`
  return out
}

// Нормализованный вид для отправки/хранения: +7XXXXXXXXXX
export function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '')
  if (digits[0] === '8') digits = '7' + digits.slice(1)
  if (digits[0] !== '7') digits = '7' + digits
  digits = digits.slice(0, 11)
  return '+' + digits
}

// ── Буфер обмена ──
// Копирование текста с фолбэком: Clipboard API требует HTTPS (secure context),
// поэтому по http (например, локальный IP) используем легаси-execCommand.
// Возвращает Promise<boolean> — удалось ли скопировать.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // упало — пробуем легаси-способ ниже
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// ── Скидка ──
// Возвращает процент скидки (целое > 0), если задана корректная старая цена.
export function discountPercent(product) {
  const old = Number(product?.oldPrice) || 0
  const price = Number(product?.price) || 0
  if (old > price && price > 0) return Math.round((1 - price / old) * 100)
  return 0
}
