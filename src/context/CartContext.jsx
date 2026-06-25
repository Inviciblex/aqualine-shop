import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react'
import { addToCart, setQtyInCart, removeFromCart, cartTotals } from '../cart-logic.js'

/**
 * Состояние корзины хранится в React state и дублируется в localStorage,
 * поэтому переживает перезагрузку страницы и повторный визит.
 * Ключ хранения — STORAGE_KEY. Чтобы вернуться к хранению только в памяти,
 * уберите загрузку из localStorage в useState и эффект ниже.
 */

const STORAGE_KEY = 'aqualine_cart_v1'

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    // лёгкая проверка структуры, чтобы битые данные не сломали приложение
    return Array.isArray(parsed)
      ? parsed.filter((i) => i && i.product && typeof i.qty === 'number')
      : []
  } catch {
    return []
  }
}

const CartContext = createContext(null)

export function CartProvider({ children }) {
  // items: массив { product, qty } — начальное значение берём из localStorage
  const [items, setItems] = useState(loadCart)

  // при любом изменении корзины сохраняем её
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // приватный режим браузера может запрещать запись — тихо игнорируем
    }
  }, [items])

  // Уведомление («тост») о добавлении товара. Меняем при каждом добавлении —
  // компонент Toast в App показывает его и сам прячет.
  const [notice, setNotice] = useState(null)

  // Открыта ли корзина-шторка. Держим в контексте, а не в App, чтобы любая
  // карточка товара (в т.ч. в ленте и «похожих») могла открыть корзину без
  // проброса колбэков через все уровни.
  const [cartOpen, setCartOpen] = useState(false)
  const openCart = useCallback(() => setCartOpen(true), [])
  const closeCart = useCallback(() => setCartOpen(false), [])

  const addItem = useCallback((product, qty = 1) => {
    setItems((prev) => addToCart(prev, product, qty))
    setNotice({ id: Date.now(), text: `«${product.name}» в корзине` })
  }, [])

  const setQty = useCallback((productId, qty) => {
    setItems((prev) => setQtyInCart(prev, productId, qty))
  }, [])

  const removeItem = useCallback((productId) => {
    setItems((prev) => removeFromCart(prev, productId))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const { totalQty, totalSum } = useMemo(() => cartTotals(items), [items])

  const value = {
    items,
    addItem,
    setQty,
    removeItem,
    clearCart,
    totalQty,
    totalSum,
    notice,
    cartOpen,
    openCart,
    closeCart,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart должен использоваться внутри <CartProvider>')
  return ctx
}
