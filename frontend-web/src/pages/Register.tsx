import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios, { AxiosError } from 'axios'
import { demoRegister, isBackendDown } from '../store/demoStore'
import type { UserRole } from '../api/types'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'TECHNICIAN', label: 'Монтажник / Техник' },
  { value: 'CUSTOMER',   label: 'Представитель заказчика' },
  { value: 'AUDITOR',    label: 'Контролёр' },
]

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', full_name: '', phone: '', role: 'TECHNICIAN' as UserRole, password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Пароли не совпадают'); return }
    if (form.password.length < 6) { setError('Пароль должен быть не менее 6 символов'); return }

    setLoading(true)
    try {
      await axios.post('/api/v1/auth/register', {
        email:     form.email,
        full_name: form.full_name,
        phone:     form.phone || undefined,
        role:      form.role,
        password:  form.password,
      }, { timeout: 3000 })

      setSuccess(true)
      setTimeout(() => navigate('/login'), 1500)

    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>
      const status   = axiosErr.response?.status

      if (status === 400) {
        setError(axiosErr.response?.data?.detail ?? 'Email уже зарегистрирован')
        return
      }

      if (isBackendDown(status)) {
        const result = demoRegister({
          email:     form.email,
          password:  form.password,
          full_name: form.full_name,
          phone:     form.phone || undefined,
          role:      form.role,
        })
        if (!result.ok) { setError(result.error); return }
        setSuccess(true)
        setTimeout(() => navigate('/login'), 1500)
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
          <span className="md3-login__shield" aria-hidden>person_add</span>
          SecureTO
        </div>

        <h1 className="md3-login__hero">Создайте учётную запись для работы в системе</h1>

        <ul className="md3-login__features" aria-label="Возможности">
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>verified_user</span>
            Доступ выдаётся по корпоративной почте
          </li>
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>admin_panel_settings</span>
            Роль и права настраивает администратор
          </li>
          <li className="md3-login__feature">
            <span className="ic" aria-hidden>support_agent</span>
            Помощь — техподдержка Ростелеком
          </li>
        </ul>
      </aside>

      <main className="md3-login__form">
        <form className="md3-login__form-inner" onSubmit={handleSubmit} noValidate style={{ maxWidth: 420 }}>
          <h2 className="md3-login__title">Регистрация</h2>
          <p className="md3-login__sub">SecureTO · Система ТО охраны и СКУД</p>

          {success ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <span style={{
                fontFamily: 'Material Symbols Rounded', fontSize: 56,
                color: '#52C97E', fontVariationSettings: "'FILL' 1, 'wght' 500",
                display: 'block', marginBottom: 12,
              }}>check_circle</span>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--md-sys-color-on-surface)', marginBottom: 6 }}>Аккаунт создан</div>
              <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>Перенаправление на страницу входа…</div>
            </div>
          ) : (
            <>
              {([
                ['email',     'Email',              'email'],
                ['full_name', 'ФИО',                'text'],
                ['phone',     'Телефон (необязательно)', 'tel'],
              ] as [keyof typeof form, string, string][]).map(([key, label, type]) => (
                <div key={key} className="md3-field">
                  <input
                    id={key}
                    className="md3-field__input"
                    type={type}
                    required={key !== 'phone'}
                    value={form[key]}
                    onChange={set(key)}
                  />
                  <label htmlFor={key} className="md3-field__label">{label}</label>
                </div>
              ))}

              <div className="md3-field">
                <select
                  id="role"
                  className="md3-field__input"
                  value={form.role}
                  onChange={set('role')}
                  style={{ cursor: 'pointer' }}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <label htmlFor="role" className="md3-field__label">Роль</label>
              </div>

              {([
                ['password', 'Пароль'],
                ['confirm',  'Повторите пароль'],
              ] as [keyof typeof form, string][]).map(([key, label]) => (
                <div key={key} className="md3-field">
                  <input
                    id={key}
                    className="md3-field__input"
                    type="password"
                    required
                    value={form[key]}
                    onChange={set(key)}
                  />
                  <label htmlFor={key} className="md3-field__label">{label}</label>
                </div>
              ))}

              {error && <div className="md3-login__error" role="alert">{error}</div>}

              <button type="submit" className="md3-btn-filled" disabled={loading}>
                {loading && <span className="md3-spinner" aria-hidden />}
                {loading ? 'Создание…' : 'Создать аккаунт'}
              </button>

              <div className="md3-login__meta">
                <span>Уже есть аккаунт?</span>
                <Link to="/login">Войти</Link>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  )
}
