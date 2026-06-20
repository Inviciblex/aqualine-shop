// Юнит-тесты чистой логики фронтенда. Без внешних зависимостей — встроенный
// node:test, функции из src/utils.js используют только Intl и регулярки,
// поэтому прекрасно проверяются в node без браузера.
//
// Запуск:  npm test   (из корня)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPrice, normalizePhone, formatPhoneInput, discountPercent } from '../src/utils.js'

test('formatPrice: разряды и знак рубля', () => {
  // Разделитель разрядов в ru-RU зависит от версии ICU (обычный/узкий
  // неразрывный пробел), поэтому сверяем без пробелов — устойчиво.
  assert.equal(formatPrice(4990).replace(/\s/g, ''), '4990₽')
  assert.equal(formatPrice(0).replace(/\s/g, ''), '0₽')
  assert.equal(formatPrice(1234567).replace(/\s/g, ''), '1234567₽')
})

test('normalizePhone: приводит к виду +7XXXXXXXXXX', () => {
  assert.equal(normalizePhone('8 (916) 123-45-67'), '+79161234567')
  assert.equal(normalizePhone('+7 916 123 45 67'), '+79161234567')
  assert.equal(normalizePhone('79161234567'), '+79161234567')
  // лишние цифры обрезаются до 11
  assert.equal(normalizePhone('8916123456789'), '+79161234567')
})

test('formatPhoneInput: маска по мере набора', () => {
  assert.equal(formatPhoneInput(''), '')
  assert.equal(formatPhoneInput('8916'), '+7 (916)')
  assert.equal(formatPhoneInput('89161234567'), '+7 (916) 123-45-67')
  // ведущая 7 тоже нормализуется
  assert.equal(formatPhoneInput('79161234567'), '+7 (916) 123-45-67')
})

test('discountPercent: процент только при корректной старой цене', () => {
  assert.equal(discountPercent({ oldPrice: 1000, price: 800 }), 20)
  assert.equal(discountPercent({ oldPrice: 5000, price: 4990 }), 0) // округление < 1%
  assert.equal(discountPercent({ oldPrice: 100, price: 200 }), 0) // «скидка» вверх — нет
  assert.equal(discountPercent({ price: 800 }), 0) // нет oldPrice
  assert.equal(discountPercent(null), 0) // защита от null
})
