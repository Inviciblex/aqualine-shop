// Страница «Контакты». ЗАМЕНИТЕ плейсхолдеры в квадратных скобках на реальные
// данные магазина (адрес, часы, телефон и т.д.) перед запуском.

// Адрес магазина — укажите реальный (по нему строится маршрут в картах).
const STORE_ADDRESS = 'г. Краснодар, ул. Володи Головатого, 286/1'
// Ссылка открывает приложение/сайт карт с маршрутом до магазина от текущего
// местоположения. Для Яндекс.Карт замените на:
// `https://yandex.ru/maps/?rtext=~${encodeURIComponent(STORE_ADDRESS)}&rtt=auto`
const ROUTE_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(STORE_ADDRESS)}`

export default function Contacts({ onBack }) {
  return (
    <main className="legal contacts">
      <a className="back" href="#/" onClick={onBack}>
        <span aria-hidden="true">←</span> Назад в каталог
      </a>

      <h1 className="legal__title">Контакты и самовывоз</h1>
      <p className="legal__lead">
        Заказы выдаём самовывозом. Оформите заказ на сайте — мы свяжемся с вами,
        подтвердим наличие и согласуем время.
      </p>

      <dl className="contacts__list">
        <div className="contacts__row">
          <dt>Адрес</dt>
          <dd>
            <a href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
              {STORE_ADDRESS}
            </a>
            <span className="contacts__hint"> — нажмите, чтобы построить маршрут</span>
          </dd>
        </div>
        <div className="contacts__row">
          <dt>Часы работы</dt>
          <dd>Пн–Пт [09:00–19:00], Сб [10:00–16:00], Вс [выходной]</dd>
        </div>
        <div className="contacts__row">
          <dt>Телефон</dt>
          <dd><a href="tel:[+70000000000]">[+7 (000) 000-00-00]</a></dd>
        </div>
        <div className="contacts__row">
          <dt>Email</dt>
          <dd><a href="mailto:[shop@example.ru]">[shop@example.ru]</a></dd>
        </div>
        <div className="contacts__row">
          <dt>Telegram</dt>
          <dd><a href="https://t.me/[username]" target="_blank" rel="noopener noreferrer">@[username]</a></dd>
        </div>
      </dl>

      <h2 className="legal__h2">Как добраться</h2>
      <p>
        [Ориентиры: ближайшая остановка/метро, как пройти, есть ли парковка.]
      </p>
      {/* Чтобы показать карту, вставьте сюда iframe Яндекс.Карт или 2ГИС
          (Поделиться → Встроить) с вашим адресом. */}
      <p className="legal__note">
        Реквизиты: [ИП/ООО «Название», ИНН 000000000000].
      </p>
    </main>
  )
}
