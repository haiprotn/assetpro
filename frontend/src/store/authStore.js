import { create } from 'zustand'
import { authApi } from '../services/api'

const storedUser = localStorage.getItem('auth_user')

export const useAuthStore = create((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (username, password) => {
    const { data } = await authApi.login(username, password)
    const user = { role: data.role, username: data.username }
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    set({ token: data.access_token, isAuthenticated: true, user })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('auth_user')
    set({ token: null, isAuthenticated: false, user: null })
  },
}))
