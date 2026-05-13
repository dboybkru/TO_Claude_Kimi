import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useMutation } from '../api/useApi'
import { usersApi } from '../api/services'
import { ROLE_LABELS, ROLE_COLORS } from '../utils/roles'
import { FormField, inputCss } from '../components/FormField'

export default function Profile() {
  const user    = useAuthStore(s => s.user)
  const setUser = useAuthStore(s => s.setUser)
  const [editMode, setEdit] = useState(false)
  const [form, setForm]     = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '' })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [saved, setSaved]   = useState('')
  const [pwError, setPwError] = useState('')

  const { mutate: updateProfile, loading: savingProfile } = useMutation(
    (data: { full_name: string; phone: string }) => usersApi.update(user!.id, data)
  )
  const { mutate: changePassword, loading: savingPw } = useMutation(
    (data: { password: string }) => usersApi.update(user!.id, data)
  )

  async function saveProfile() {
    const updated = await updateProfile({ full_name: form.full_name, phone: form.phone })
    if (updated) { setUser(updated); setEdit(false); setSaved('Профиль сохранён') }
  }

  async function savePassword() {
    setPwError('')
    if (pwForm.next.length < 6) { setPwError('Минимум 6 символов'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('Пароли не совпадают'); return }
    const result = await changePassword({ password: pwForm.next })
    if (result) { setPwForm({ current: '', next: '', confirm: '' }); setSaved('Пароль изменён') }
  }

  if (!user) return null
  const [rbg, rc] = ROLE_COLORS[user.role] ?? ROLE_COLORS.AUDITOR
  const initials  = user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="md3-page" style={{ maxWidth: 720 }}>
      <nav aria-label="breadcrumbs" style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        <span style={{ cursor: 'pointer' }}>Дашборд</span>
        <span style={{ margin: '0 8px', color: 'var(--md-sys-color-outline)' }}>›</span>
        <span style={{ color: 'var(--md-sys-color-on-surface)', fontWeight: 500 }}>Мой профиль</span>
      </nav>

      {saved && (
        <div style={{
          background: '#0E3B22',
          color: '#B6F0C2',
          borderRadius: 'var(--md-sys-shape-corner-small)',
          padding: '12px 16px',
          fontSize: 13.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            {saved}
          </span>
          <button className="md3-icon-btn" onClick={() => setSaved('')} aria-label="Закрыть">
            <span className="ic" aria-hidden>close</span>
          </button>
        </div>
      )}

      {/* Avatar + info */}
      <div className="md3-card" style={{ padding: 24, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{
          width: 72, height: 72, flexShrink: 0,
          borderRadius: '50%',
          background: 'var(--md-sys-color-primary-container)',
          color: 'var(--md-sys-color-on-primary-container)',
          display: 'grid', placeItems: 'center',
          fontSize: 24, fontWeight: 600,
        }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--md-sys-color-on-surface)', lineHeight: '28px' }}>{user.full_name}</div>
          <div style={{ fontSize: 13.5, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>{user.email}</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: rbg, color: rc, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 4 }}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
            <span style={{
              fontSize: 12,
              color: user.is_active ? '#52C97E' : 'var(--md-sys-color-error)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              {user.is_active ? 'Активен' : 'Заблокирован'}
            </span>
          </div>
        </div>
        <button onClick={() => setEdit(e => !e)} className="md3-btn-tonal">
          <span className="ic" aria-hidden>{editMode ? 'close' : 'edit'}</span>
          {editMode ? 'Отмена' : 'Редактировать'}
        </button>
      </div>

      {/* Edit form */}
      {editMode && (
        <div className="md3-card" style={{ padding: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: 'var(--md-sys-color-on-surface-variant)',
            textTransform: 'uppercase', letterSpacing: '0.8px',
            marginBottom: 16,
          }}>Личные данные</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="ФИО">
              <input style={inputCss} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </FormField>
            <FormField label="Телефон">
              <input style={inputCss} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+7 (900) 000-00-00" />
            </FormField>
            <button disabled={savingProfile} onClick={saveProfile}
              className="md3-btn-filled"
              style={{ alignSelf: 'flex-start', width: 'auto', padding: '0 24px' }}>
              {savingProfile && <span className="md3-spinner" aria-hidden />}
              {savingProfile ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Password change */}
      <div className="md3-card" style={{ padding: 20 }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: 'var(--md-sys-color-on-surface-variant)',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          marginBottom: 16,
        }}>Сменить пароль</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Новый пароль" hint="Минимум 6 символов">
            <input type="password" style={inputCss} value={pwForm.next}
              onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="Минимум 6 символов" />
          </FormField>
          <FormField label="Повторите новый пароль">
            <input type="password" style={inputCss} value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" />
          </FormField>
          {pwError && (
            <div style={{
              background: 'var(--md-sys-color-error-container)',
              color: 'var(--md-sys-color-on-error-container)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
              padding: '10px 14px',
              fontSize: 13,
            }}>{pwError}</div>
          )}
          <button disabled={savingPw || !pwForm.next} onClick={savePassword}
            className="md3-btn-tonal"
            style={{ alignSelf: 'flex-start' }}>
            <span className="ic" aria-hidden>key</span>
            {savingPw ? 'Сохранение…' : 'Сменить пароль'}
          </button>
        </div>
      </div>
    </div>
  )
}
