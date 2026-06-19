import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadFavorites, saveFavorites, toggleId } from '../favorites-store.js'

/**
 * Избранные товары (id) хранятся в React state и дублируются в localStorage —
 * переживают перезагрузку и повторный визит. Без регистрации, привязано к
 * устройству (как «Мои заказы»).
 */
const FavoritesContext = createContext(null)

export function FavoritesProvider({ children }) {
  const [ids, setIds] = useState(() => loadFavorites())

  useEffect(() => {
    saveFavorites(ids)
  }, [ids])

  const toggle = useCallback((id) => setIds((prev) => toggleId(prev, id)), [])
  const isFavorite = useCallback((id) => ids.includes(id), [ids])

  const value = { ids, toggle, isFavorite, count: ids.length }
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites должен использоваться внутри <FavoritesProvider>')
  return ctx
}
