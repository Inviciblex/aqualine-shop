// Страница «Контакты». Данные магазина (адрес, часы, телефон, Telegram, карта) —
// в общем модуле src/store.js. ЗАМЕНИТЕ плейсхолдеры там перед запуском.
import {
  STORE_ADDRESS,
  MAPS_URL,
  MAPS_EMBED_URL,
  STORE_HOURS,
  STORE_PHONE,
  STORE_PHONE_HREF,
  STORE_TELEGRAM,
  STORE_TELEGRAM_URL,
  STORE_EMAIL,
  STORE_EMAIL_HREF,
  HOLD_DAYS,
} from '../store.js'

export default function Contacts({ onBack }) {
  return (
    <main className="legal contacts">
      <a className="back" href="#/" onClick={onBack}>
        <span aria-hidden="true">←</span> Назад в каталог
      </a>

      <h1 className="legal__title">Контакты и самовывоз</h1>
      <p className="legal__lead">
        Заказы выдаём самовывозом. Оформите заказ на сайте — мы свяжемся с вами, подтвердим наличие
        и согласуем время. Или напишите/позвоните нам напрямую:
      </p>

      {/* Быстрая связь — звонок и Telegram в один тап */}
      <div className="contacts__actions">
        <a className="contact-btn contact-btn--call" href={STORE_PHONE_HREF}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path
              d="M6.5 4 h3 l1.5 4 -2 1.5 a11 11 0 0 0 5 5 l1.5 -2 4 1.5 v3 a1.5 1.5 0 0 1 -1.7 1.5 A16 16 0 0 1 5 6.2 1.5 1.5 0 0 1 6.5 4 z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            Позвонить
            <span className="contact-btn__sub">{STORE_PHONE}</span>
          </span>
        </a>
        <a
          className="contact-btn contact-btn--tg"
          href={STORE_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path
              d="M21 4 L2.5 11 l5 1.8 L9 19 l3 -3.2 4.5 3.4 z M7.5 12.8 L17 6.5 l-7 7 -.2 3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            Telegram
            <span className="contact-btn__sub">{STORE_TELEGRAM}</span>
          </span>
        </a>
      </div>

      <dl className="contacts__list">
        <div className="contacts__row">
          <dt>Адрес</dt>
          <dd>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              {STORE_ADDRESS}
            </a>
            <span className="contacts__hint"> — открыть на картах (кнопка «Маршрут» внутри)</span>
          </dd>
        </div>
        <div className="contacts__row">
          <dt>Часы работы</dt>
          <dd>{STORE_HOURS}</dd>
        </div>
        <div className="contacts__row">
          <dt>Email</dt>
          <dd>
            <a href={STORE_EMAIL_HREF}>{STORE_EMAIL}</a>
          </dd>
        </div>
        <div className="contacts__row">
          <dt>Бронь</dt>
          <dd>Держим {HOLD_DAYS} дн. до самовывоза, оплата при получении</dd>
        </div>
      </dl>

      <h2 className="legal__h2">Как добраться</h2>
      <div className="contacts__map">
        <iframe
          src={MAPS_EMBED_URL}
          title={`Карта: ${STORE_ADDRESS}`}
          loading="lazy"
          allowFullScreen
        />
      </div>

      <p className="legal__note">Реквизиты: [ИП/ООО «Название», ИНН 000000000000].</p>
    </main>
  )
}
