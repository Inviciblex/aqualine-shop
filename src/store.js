// Единые данные магазина — используются и на странице «Контакты», и в футере.
// ЗАМЕНИТЕ на свои перед запуском.

export const STORE_ADDRESS = 'г. Краснодар, ул. Володи Головатого, 286/1'

// Чистый запрос для геокодера карт (без «г.»/«ул.» — так надёжнее находит дом).
const MAPS_QUERY = 'Краснодар, улица Володи Головатого, 286/1'

// Открывает точку магазина в Яндекс.Картах (приложение или веб); внутри —
// кнопка «Маршрут». Надёжнее текстового авто-маршрута rtext.
export const MAPS_URL = `https://yandex.ru/maps/?text=${encodeURIComponent(MAPS_QUERY)}`

// Встраиваемая карта (iframe) на странице «Контакты». Поиск по адресу — пин
// ставится на найденную точку. ЗАМЕНИТЕ адрес на свой (через MAPS_QUERY выше).
// Требует frame-src https://yandex.ru в CSP (см. deploy/nginx.conf).
export const MAPS_EMBED_URL = `https://yandex.ru/map-widget/v1/?mode=search&text=${encodeURIComponent(
  MAPS_QUERY,
)}&z=16`

// ── Быстрая связь ── ЗАМЕНИТЕ на реальные перед запуском.
// Телефон: отображаемый вид и href для tel: (только цифры, без скобок/пробелов).
export const STORE_PHONE = '+7 (000) 000-00-00'
export const STORE_PHONE_HREF = 'tel:+70000000000'
// Telegram: отображаемый @username и ссылка на чат.
export const STORE_TELEGRAM = '@aqualine'
export const STORE_TELEGRAM_URL = 'https://t.me/aqualine'

// Часы работы (показываются в «Контактах» и на экране подтверждения брони).
export const STORE_HOURS = 'Пн–Пт 9:00–19:00, Сб 10:00–16:00, Вс — выходной'

// Сколько дней держим бронь до самовывоза.
export const HOLD_DAYS = 2

// Способы оплаты — только при получении (онлайн-оплаты нет). Показывается
// на странице товара и при оформлении брони.
export const PAYMENT_METHODS = 'Картой или наличными при получении'
