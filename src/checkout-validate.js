// Чистая логика валидации формы оформления брони. Вынесено из Checkout.jsx,
// чтобы покрыть тестами без рендера компонента.
//
// Возвращает объект ошибок по полям; пустой объект ({}) означает, что форма
// валидна. Тексты ошибок совпадают с теми, что показываются в форме.
export function validateCheckout(form) {
  const errors = {}
  if ((form.name || '').trim().length < 2) errors.name = 'Укажите имя'
  const digits = (form.phone || '').replace(/\D/g, '')
  if (digits.length < 11) errors.phone = 'Укажите телефон полностью'
  if (!form.consent) errors.consent = 'Необходимо согласие на обработку персональных данных'
  return errors
}
