import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiMe,
  apiUpdateProfile,
  apiChangePassword,
} from '../auth-api.js'

/**
 * Личный кабинет: вход/регистрация по email + паролю. Сессия — httpOnly-cookie,
 * поэтому в state держим только профиль (не токены). При монтировании спрашиваем
 * /me, чтобы восстановить вход после перезагрузки. Аккаунт НЕ связан с админкой
 * (та — по отдельному токену), поэтому роли admin здесь нет.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // admin — email пользователя в белом списке ADMIN_EMAILS на сервере (приходит
  // флагом в ответах /me, login, register). Даёт доступ к админке по аккаунту.
  const [admin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    apiMe().then((res) => {
      if (!alive) return
      setUser(res.ok ? res.user : null)
      setAdmin(Boolean(res.ok && res.admin))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const register = useCallback(async (data) => {
    const res = await apiRegister(data)
    if (res.ok) {
      setUser(res.user)
      setAdmin(Boolean(res.admin))
    }
    return res
  }, [])

  const login = useCallback(async (data) => {
    const res = await apiLogin(data)
    if (res.ok) {
      setUser(res.user)
      setAdmin(Boolean(res.admin))
    }
    return res
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setAdmin(false)
  }, [])

  const updateProfile = useCallback(async (data) => {
    const res = await apiUpdateProfile(data)
    if (res.ok) setUser(res.user)
    return res
  }, [])

  const changePassword = useCallback((data) => apiChangePassword(data), [])

  const value = { user, admin, loading, register, login, logout, updateProfile, changePassword }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  return ctx
}
