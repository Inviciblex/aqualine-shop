import { getCategoryIconPaths } from '../utils.js'
import { onProxyImgError } from '../image-url.js'

// Небольшая квадратная миниатюра товара для корзины и «Мои брони». Если фото нет
// (или товара уже нет в живом каталоге) — рисуем иконку категории на плашке, как
// в заглушках карточек. alt пустой: рядом всегда есть название товара текстом,
// иначе скринридер читал бы его дважды.
export default function MiniThumb({ src, category, className = '' }) {
  const cls = `mini-thumb ${className}`.trim()
  if (src) {
    return (
      <img
        className={cls}
        src={src}
        alt=""
        width="52"
        height="52"
        loading="lazy"
        decoding="async"
        onError={onProxyImgError}
      />
    )
  }
  return (
    <span className={`${cls} mini-thumb--placeholder`} aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: getCategoryIconPaths(category) }}
      />
    </span>
  )
}
