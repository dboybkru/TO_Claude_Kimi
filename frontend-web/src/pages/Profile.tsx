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
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: 600 }}>
      <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 20 }}>
        <span style={{ color: '#4d7a9e' }}>Дашборд</span>
        <span style={{ color: '#2a4460', margin: '0 6px' }}>›</span>
        <span style={{ color: 'var(--text-1)' }}>Мой профиль</span>
      </div>

      {saved && (
        <div style={{ background: 'var(--green-bg)', border: '1px solid #1a4030', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--green)', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          ✓ {saved}
          <span onClick={() => setSaved('')} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* Avatar + info */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: rbg, color: rc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, border: `2px solid ${rc}44`, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8f1fa' }}>{user.full_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{user.email}</div>
          <div style={{ marginTop: 8 }}>
            <span style={{ background: rbg, color: rc, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4 }}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
            <span style={{ marginLeft: 8, fontSize: 11, color: user.is_active ? 'var(--green)' : 'var(--red)' }}>
              {user.is_active ? '● Активен' : '● Заблокирован'}
            </span>
          </div>
        </div>
        <button onClick={() => setEdit(e => !e)}
          style={{ padding: '8px 16px', borderRadius: 8, background: editMode ? '#1a2e42' : 'var(--blue)', color: editMode ? 'var(--text-4)' : '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {editMode ? 'Отмена' : '✏ Редактировать'}
        </button>
      </div>

      {/* Edit form */}
      {editMode && (
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>Личные данные</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label="ФИО">
              <input style={inputCss} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </FormField>
            <FormField label="Телефон">
              <input style={inputCss} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+7 (900) 000-00-00" />
            </FormField>
            <button disabled={savingProfile} onClick={saveProfile}
              style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: savingProfile ? '#1a2e42' : 'var(--blue)', color: savingProfile ? 'var(--text-4)' : '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: savingProfile ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {savingProfile ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Password change */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>Сменить пароль</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="Новый пароль">
            <input type="password" style={inputCss} value={pwForm.next}
              onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="Минимум 6 символов" />
          </FormField>
          <FormField label="Повторите новый пароль">
            <input type="password" style={inputCss} value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" />
          </FormField>
          {pwError && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{pwError}</div>}
          <button disabled={savingPw || !pwForm.next} onClick={savePassword}
            style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: savingPw || !pwForm.next ? '#1a2e42' : '#1a3a2a', color: savingPw || !pwForm.next ? 'var(--text-4)' : 'var(--green)', border: `1px solid ${savingPw || !pwForm.next ? 'transparent' : '#1a4030'}`, fontSize: 13, fontWeight: 600, cursor: savingPw || !pwForm.next ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {savingPw ? 'Сохранение…' : '🔑 Сменить пароль'}
          </button>
        </div>
      </div>
    </div>
  )
}
