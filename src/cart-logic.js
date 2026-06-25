// Чистая логика корзины. Вынесено из CartContext.jsx для тестируемости:
// функции принимают массив позиций [{ product, qty }] и возвращают новый
// массив — без побочных эффектов, хранилища и React.

// Добавить товар: если он уже в корзине — увеличить количество, иначе добавить
// новой позицией. qty приводится к минимуму 1.
export function addToCart(items, product, qty = 1) {
  const amount = Math.max(1, qty)
  const existing = items.find((i) => i.product.id === product.id)
  if (existing) {
    return items.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + amount } : i))
  }
  return [...items, { product, qty: amount }]
}

// Задать количество позиции; qty <= 0 убирает её из корзины.
export function setQtyInCart(items, productId, qty) {
  return items.map((i) => (i.product.id === productId ? { ...i, qty } : i)).filter((i) => i.qty > 0)
}

// Удалить позицию из корзины.
export function removeFromCart(items, productId) {
  return items.filter((i) => i.product.id !== productId)
}

// Итоги корзины: суммарное количество и стоимость.
export function cartTotals(items) {
  return items.reduce(
    (acc, i) => {
      acc.totalQty += i.qty
      acc.totalSum += i.qty * i.product.price
      return acc
    },
    { totalQty: 0, totalSum: 0 },
  )
}
