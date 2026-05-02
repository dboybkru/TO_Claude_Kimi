import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios, { AxiosError } from 'axios'
import { demoRegister, isBackendDown } from '../store/demoStore'
import type { UserRole } from '../api/types'

// Only roles that the backend allows to self-register (no admin needed)
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

      // Backend unavailable — use demo mode
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

  const inputStyle = {
    width: '100%', background: '#091624', border: '1px solid #1a2e42',
    borderRadius: 8, color: '#c5d8ea', fontSize: 13, padding: '10px 14px',
    outline: 'none', fontFamily: 'inherit',
  } as const

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '36px 36px', width: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, background: 'var(--blue)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px' }}>🛡</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8f1fa' }}>Регистрация</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>SecureTO · Ростелеком</div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>Аккаунт создан!</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Перенаправление на страницу входа…</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              ['email',     'Email',              'email',    'ivan@example.com'],
              ['full_name', 'ФИО',                'text',     'Иванов Иван Иванович'],
              ['phone',     'Телефон (необязат.)', 'tel',      '+7 (XXX) XXX-XX-XX'],
            ] as [keyof typeof form, string, string, string][]).map(([key, label, type, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>{label}</label>
                <input type={type} value={form[key]} onChange={set(key)} required={key !== 'phone'} placeholder={placeholder} style={inputStyle} />
              </div>
            ))}

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Роль</label>
              <select value={form.role} onChange={set('role')} style={{ ...inputStyle, cursor: 'pointer' }}>
                {ROLES.map((r) => <option key={r.value} value={r.value} style={{ background: '#0d1d2c' }}>{r.label}</option>)}
              </select>
            </div>

            {([
              ['password', 'Пароль',          '••••••••'],
              ['confirm',  'Повторите пароль', '••••••••'],
            ] as [keyof typeof form, string, string][]).map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>{label}</label>
                <input type="password" value={form[key]} onChange={set(key)} required placeholder={placeholder} style={inputStyle} />
              </div>
            ))}

            {error && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ background: loading ? '#1a2e42' : 'var(--blue)', color: loading ? 'var(--text-4)' : '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', marginTop: 4 }}>
              {loading ? 'Создание…' : 'Создать аккаунт'}
            </button>

            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>
              Уже есть аккаунт?{' '}
              <Link to="/login" style={{ color: '#62b8f5', textDecoration: 'none' }}>Войти</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
