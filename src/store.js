// Единые данные магазина — используются и на странице «Контакты», и в футере.
// ЗАМЕНИТЕ на свои перед запуском.

export const STORE_ADDRESS = 'г. Краснодар, ул. Володи Головатого, 286/1'

// Точка магазина на Яндекс.Картах — короткая share-ссылка на конкретный дом.
// Открывает карту с кнопкой «Маршрут».
export const MAPS_URL = 'https://yandex.ru/maps/-/CTQ3bHNb'

// Встраиваемая карта (iframe) на «Контактах» — та же точка в формате виджета.
// Требует frame-src https://yandex.ru в CSP (см. deploy/nginx.conf).
export const MAPS_EMBED_URL = 'https://yandex.ru/map-widget/v1/-/CTQ3bHNb'

// ── Быстрая связь ──
// Телефон: отображаемый вид и href для tel: (только цифры, без скобок/пробелов).
export const STORE_PHONE = '+7 (918) 219-19-54'
export const STORE_PHONE_HREF = 'tel:+79182191954'
// Telegram: отображаемый @username и ссылка на чат.
export const STORE_TELEGRAM = '@fanto2000'
export const STORE_TELEGRAM_URL = 'https://t.me/fanto2000'
// Почта для связи и претензий.
export const STORE_EMAIL = 'stoevandrey@yandex.ru'
export const STORE_EMAIL_HREF = 'mailto:stoevandrey@yandex.ru'

// Часы работы (показываются в «Контактах» и на экране подтверждения брони).
export const STORE_HOURS = 'Ежедневно 8:00–17:00, без выходных'

// Сколько дней держим бронь до самовывоза.
export const HOLD_DAYS = 2

// Способы оплаты — только при получении (онлайн-оплаты нет). Показывается
// на странице товара и при оформлении брони.
export const PAYMENT_METHODS = 'Картой или наличными при получении'
