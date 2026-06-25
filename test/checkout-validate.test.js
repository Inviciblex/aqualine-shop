// Тесты валидации формы оформления брони (src/checkout-validate.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCheckout } from '../src/checkout-validate.js'

const valid = { name: 'Иван', phone: '+7 (916) 123-45-67', consent: true }

test('валидная форма → нет ошибок', () => {
  assert.deepEqual(validateCheckout(valid), {})
})

test('короткое имя (1 символ) → ошибка name', () => {
  assert.equal(validateCheckout({ ...valid, name: 'A' }).name, 'Укажите имя')
})

test('имя из пробелов → ошибка name', () => {
  assert.ok(validateCheckout({ ...valid, name: '   ' }).name)
})

test('короткий телефон → ошибка phone', () => {
  assert.ok(validateCheckout({ ...valid, phone: '+7 916' }).phone)
})

test('телефон c 11 цифрами → без ошибки phone', () => {
  assert.equal(validateCheckout({ ...valid, phone: '89161234567' }).phone, undefined)
})

test('нет согласия → ошибка consent', () => {
  assert.ok(validateCheckout({ ...valid, consent: false }).consent)
})

test('пустая форма → ошибки по всем трём полям', () => {
  const e = validateCheckout({ name: '', phone: '', consent: false })
  assert.ok(e.name && e.phone && e.consent)
})

test('не падает на отсутствующих полях', () => {
  const e = validateCheckout({})
  assert.ok(e.name && e.phone && e.consent)
})
