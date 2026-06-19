import { useEffect, useRef } from 'react'

// Доступность модальных окон: при открытии переводит фокус внутрь, удерживает
// его (Tab/Shift+Tab по кругу), закрывает по Esc и возвращает фокус на элемент,
// который был активен до открытия. Контейнеру желательно дать tabIndex={-1}.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalA11y(containerRef, { active, onClose }) {
  // onClose держим в ref, чтобы эффект не перезапускался на каждый рендер
  // (иначе фокус прыгал бы на первый элемент при любом обновлении).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const previouslyFocused = document.activeElement

    const focusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null)

    // Переводим фокус внутрь окна.
    ;(focusable()[0] || container).focus?.()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef])
}
