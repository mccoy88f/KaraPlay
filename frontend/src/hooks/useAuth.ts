import { useStore } from '../store/useStore'
import api from '../api/client'
import toast from 'react-hot-toast'

export function useAuth() {
  const { token, user, currentEvent, setToken, setUser, setCurrentEvent, logout } = useStore()

  const join = async (nickname: string, joinCode: string) => {
    const res = await api.post('/auth/join', { nickname, joinCode })
    const { token: t, user: u, event } = res.data
    setToken(t)
    setUser({ ...u, role: 'guest' })
    setCurrentEvent(event)
    localStorage.setItem('kk_token', t)
    return { user: u, event }
  }

  const requestOtp = async (email: string) => {
    await api.post('/auth/request-otp', { email })
    toast.success('OTP inviato! Controlla la tua email.')
  }

  const verifyOtp = async (email: string, code: string) => {
    const res = await api.post('/auth/verify-otp', { email, code, currentToken: token })
    const { token: t, user: u } = res.data
    setToken(t)
    setUser({ ...u, role: 'user' })
    localStorage.setItem('kk_token', t)
    return u
  }

  const adminLogin = (adminToken: string) => {
    setToken(adminToken)
    setUser({ id: 'admin', nickname: 'Admin', role: 'admin' })
    localStorage.setItem('kk_token', adminToken)
  }

  const doLogout = () => {
    localStorage.removeItem('kk_token')
    logout()
  }

  return { token, user, currentEvent, join, requestOtp, verifyOtp, adminLogin, logout: doLogout, isAdmin: user?.role === 'admin' }
}
