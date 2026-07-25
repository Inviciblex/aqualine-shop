import { useLayoutEffect } from 'react'

// Плавное появление блоков по скроллу (для длинных контентных страниц). Вешает
// .reveal на выбранные дочерние элементы контейнера и через IntersectionObserver
// добавляет .is-visible «волной» сверху вниз со стаггером. Уважает
// prefers-reduced-motion и отсутствие IntersectionObserver — тогда ничего не
// трогаем, всё видно сразу. useLayoutEffect: .reveal ставим до отрисовки, чтобы
// не было мигания. trigger — необязательное значение (напр. имя маршрута): при
// его смене эффект переустанавливается (нужно для контейнеров, которые не
// размонтируются при навигации).
export function useReveal(ref, selector = ':scope > *:not(.back)', trigger) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const els = Array.from(root.querySelectorAll(selector))
    if (!els.length) return
    els.forEach((el) => el.classList.add('reveal'))
    const io = new IntersectionObserver(
      (entries) => {
        const showing = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => {
            const dt = Math.round(a.boundingClientRect.top) - Math.round(b.boundingClientRect.top)
            return dt !== 0 ? dt : a.boundingClientRect.left - b.boundingClientRect.left
          })
        showing.forEach((e, i) => {
          const el = e.target
          el.style.transitionDelay = `${i * 0.09}s`
          el.classList.add('is-visible')
          el.addEventListener('transitionend', () => (el.style.transitionDelay = ''), {
            once: true,
          })
          io.unobserve(el)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ref, selector, trigger])
}
