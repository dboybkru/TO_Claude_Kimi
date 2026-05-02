import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'
import { demoLogin, isBackendDown } from '../store/demoStore'
import type { Token, User } from '../api/types'

export default function Login() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)
  const [email, setEmail]       = useState('dboy@bk.ru')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const form = new URLSearchParams()
      form.append('username', email)
      form.append('password', password)
      const { data: tokenData } = await axios.post<Token>('/api/v1/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 3000,
      })
      const { data: me } = await axios.get<User>('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      login(tokenData.access_token, me, tokenData.refresh_token)
      navigate('/dashboard')

    } catch (err) {
      const axiosErr = err as AxiosError
      const status   = axiosErr.response?.status

      if (status === 401) {
        setError('Неверный email или пароль')
        return
      }

      // Backend unavailable (no connection or proxy error) — try demo mode
      if (isBackendDown(status)) {
        const user = demoLogin(email, password)
        if (user) {
          login('demo-token', user)
          navigate('/dashboard')
          return
        }
        setError('Неверный email или пароль (демо-режим: бэкенд недоступен)')
        return
      }

      setError('Ошибка сервера. Попробуй ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: '#091624', border: '1px solid #1a2e42',
    borderRadius: 8, color: '#c5d8ea', fontSize: 13, padding: '10px 14px',
    outline: 'none', fontFamily: 'inherit',
  } as const

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 36px', width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'var(--blue)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>🛡</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8f1fa' }}>SecureTO</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Система ТО охраны и СКУД · Ростелеком</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ background: loading ? '#1a2e42' : 'var(--blue)', color: loading ? 'var(--text-4)' : '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', marginTop: 4 }}>
            {loading ? 'Вход…' : 'Войти в систему'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
            Нет аккаунта?{' '}
            <Link to="/register" style={{ color: '#62b8f5', textDecoration: 'none' }}>Регистрация</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
