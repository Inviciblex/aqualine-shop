import { useEffect, useState } from 'react'

// Плавающая кнопка «Наверх» — появляется после прокрутки и возвращает к началу.
export default function ScrollTopButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      className="scroll-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Наверх"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 19 V6 M6 11 l6 -6 l6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
