import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'
import { demoLogin, isBackendDown } from '../store/demoStore'
import type { Token, User } from '../api/types'

export default function Login() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)
  const [email, setEmail]       = useState(() => localStorage.getItem('secureto.rememberedEmail') ?? 'dboy@bk.ru')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem('secureto.rememberedEmail')))

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
      if (remember) localStorage.setItem('secureto.rememberedEmail', email)
      else localStorage.removeItem('secureto.rememberedEmail')
      login(tokenData.access_token, me, tokenData.refresh_token)
      navigate('/dashboard')

    } catch (err) {
      const axiosErr = err as AxiosError
      const status   = axiosErr.response?.status

      if (status === 401) {
        setError('Неверный email или пароль')
        return
      }

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

  return (
    <div className="md3-login">
      <aside className="md3-login__brand">
        <div className="md3-login__lockup">
          <span className="md3-login__shield" aria-hidden>shield</span>
          SecureTO
        </div>

        <h1 className="md3-login__hero">
          Техобслуживание охраны и СКУД — в одном окне
        </h1>

        <ul className="md3-login__features" aria-label="Возможности">
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>verified</span>
            Регламентные работы и журналы по объектам
          </li>
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>key</span>
            Картотека ключей, считывателей и контроллеров
          </li>
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>notifications_active</span>
            Заявки и уведомления в реальном времени
          </li>
        </ul>
      </aside>

      <main className="md3-login__form">
        <form className="md3-login__form-inner" onSubmit={handleSubmit} noValidate>
          <h2 className="md3-login__title">Вход</h2>
          <p className="md3-login__sub">
            Система ТО охраны и СКУД · Ростелеком
          </p>

          <div className={`md3-field ${error ? 'md3-field--error' : ''}`}>
            <input
              id="email"
              className="md3-field__input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="email" className="md3-field__label">Email</label>
          </div>

          <div className={`md3-field ${error ? 'md3-field--error' : ''}`}>
            <input
              id="password"
              className="md3-field__input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="password" className="md3-field__label">Пароль</label>
          </div>

          <div className="md3-login__row">
            <label className="md3-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="md3-checkbox__box" aria-hidden />
              Запомнить меня
            </label>
            <a className="md3-login__meta" href="#" style={{ margin: 0 }}>
              <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 600 }}>Забыли пароль?</span>
            </a>
          </div>

          {error && (
            <div className="md3-login__error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="md3-btn-filled" disabled={loading}>
            {loading && <span className="md3-spinner" aria-hidden />}
            {loading ? 'Вход…' : 'Войти в систему'}
          </button>

          <div className="md3-divider-label">или</div>

          <button
            type="button"
            className="md3-btn-outlined"
            onClick={() => alert('SSO Ростелеком — заглушка (интеграция OAuth ещё не подключена)')}
          >
            <span className="ic" aria-hidden>vpn_key</span>
            Войти через SSO Ростелеком
          </button>

          <div className="md3-login__meta">
            <span>Нет аккаунта?</span>
            <Link to="/register">Регистрация</Link>
          </div>
        </form>
      </main>
    </div>
  )
}
