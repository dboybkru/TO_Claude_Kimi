import { useState, useEffect } from 'react'
import { useApi, useMutation } from '../api/useApi'
import { usersApi, type UserCreate, type UserUpdate } from '../api/services'
import { useAuthStore } from '../store/authStore'
import type { User } from '../api/types'
import Modal from '../components/Modal'
import { FormField, inputCss, selectCss } from '../components/FormField'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор', MANAGER: 'Менеджер', DISPATCHER: 'Диспетчер',
  TECHNICIAN: 'Монтажник', CUSTOMER: 'Клиент', AUDITOR: 'Аудитор',
}
const ROLE_COLORS: Record<string, [string, string]> = {
  ADMIN:      ['#2a0a3a', '#c490f0'],
  MANAGER:    ['#0a2030', '#4d8aba'],
  DISPATCHER: ['#0a2518', '#3aaa70'],
  TECHNICIAN: ['#2d1a00', '#f0a830'],
  CUSTOMER:   ['#141a1a', '#3d5a72'],
  AUDITOR:    ['#0f1a2a', '#62b8f5'],
}
const ROLES = ['ADMIN', 'MANAGER', 'DISPATCHER', 'TECHNICIAN', 'CUSTOMER', 'AUDITOR']

function RoleBadge({ role }: { role: string }) {
  const [bg, color] = ROLE_COLORS[role] ?? ROLE_COLORS.AUDITOR
  return <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{ROLE_LABELS[role] ?? role}</span>
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = ['#1a5c8a', '#1a5a3a', '#5a1a6a', '#5a3a10', '#1a1a5a', '#5a1a1a']
function avatarColor(id: string) { return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length] }

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<UserCreate>({ email: '', full_name: '', phone: '', role: 'TECHNICIAN', password: '', is_active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, loading, error } = useMutation((d: UserCreate) => usersApi.create(d))

  function f(k: keyof UserCreate) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function submit() {
    const e: Record<string, string> = {}
    if (!form.email.trim()) e.email = 'Обязательное поле'
    if (!form.full_name.trim()) e.full_name = 'Обязательное поле'
    if (!form.password || form.password.length < 6) e.password = 'Минимум 6 символов'
    setErrors(e)
    if (Object.keys(e).length) return
    const result = await mutate(form)
    if (result) {
      setForm({ email: '', full_name: '', phone: '', role: 'TECHNICIAN', password: '', is_active: true })
      onCreated()
      onClose()
    }
  }

  return (
    <Modal open={open} title="Создать пользователя" onClose={onClose} onConfirm={submit} confirmLoading={loading} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <FormField label="ФИО" required error={errors.full_name}>
          <input style={inputCss} value={form.full_name} onChange={f('full_name')} placeholder="Иванов Иван Иванович" />
        </FormField>
        <FormField label="Email" required error={errors.email}>
          <input type="email" style={inputCss} value={form.email} onChange={f('email')} placeholder="ivanov@company.ru" />
        </FormField>
        <FormField label="Телефон">
          <input style={inputCss} value={form.phone ?? ''} onChange={f('phone')} placeholder="+7 (900) 000-00-00" />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Роль">
            <select style={selectCss} value={form.role} onChange={f('role')}>
              {ROLES.map(r => <option key={r} value={r} style={{ background: '#0d1d2c' }}>{ROLE_LABELS[r]}</option>)}
            </select>
          </FormField>
          <FormField label="Пароль" required error={errors.password}>
            <input type="password" style={inputCss} value={form.password} onChange={f('password')} placeholder="••••••••" />
          </FormField>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, open, onClose, onSaved }: { user: User | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<UserUpdate>({})
  const { mutate, loading, error } = useMutation(({ id, data }: { id: string; data: UserUpdate }) => usersApi.update(id, data))

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name, phone: user.phone ?? '', role: user.role, is_active: user.is_active })
  }, [user?.id])

  if (!user) return null

  function f(k: keyof UserUpdate) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function submit() {
    const result = await mutate({ id: user!.id, data: form })
    if (result) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} title={`Редактировать: ${user.full_name}`} onClose={onClose} onConfirm={submit} confirmLoading={loading} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <FormField label="ФИО">
          <input style={inputCss} value={form.full_name ?? ''} onChange={f('full_name')} />
        </FormField>
        <FormField label="Телефон">
          <input style={inputCss} value={form.phone ?? ''} onChange={f('phone')} placeholder="+7 (900) 000-00-00" />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Роль">
            <select style={selectCss} value={form.role ?? user.role} onChange={f('role')}>
              {ROLES.map(r => <option key={r} value={r} style={{ background: '#0d1d2c' }}>{ROLE_LABELS[r]}</option>)}
            </select>
          </FormField>
          <FormField label="Статус">
            <select style={selectCss} value={form.is_active === false ? 'false' : 'true'}
              onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'true' }))}>
              <option value="true" style={{ background: '#0d1d2c' }}>Активен</option>
              <option value="false" style={{ background: '#0d1d2c' }}>Заблокирован</option>
            </select>
          </FormField>
        </div>
        <FormField label="Новый пароль">
          <input type="password" style={inputCss} placeholder="Оставьте пустым, чтобы не менять" onChange={f('password')} />
        </FormField>
      </div>
    </Modal>
  )
}

// ── Users Page ────────────────────────────────────────────────────────────────
export default function Users() {
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'ADMIN'

  const { data: users, loading, refetch } = useApi(() => usersApi.list())
  const [search, setSearch]     = useState('')
  const [filterRole, setRole]   = useState('all')
  const [createOpen, setCreate] = useState(false)
  const [editTarget, setEdit]   = useState<User | null>(null)

  const items = users ?? []
  const filtered = items.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole   = filterRole === 'all' || u.role === filterRole
    return matchSearch && matchRole
  })

  const grouped = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = items.filter(u => u.role === r).length
    return acc
  }, {})

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          <span style={{ color: '#4d7a9e' }}>Дашборд</span>
          <span style={{ color: '#2a4460', margin: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text-1)' }}>Пользователи</span>
        </span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Загрузка…</span>}
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} из {items.length}</span>
        {isAdmin && <button className="topbar-btn btn-primary" onClick={() => setCreate(true)}>+ Пользователь</button>}
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', background: '#0b1825', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2d4a62', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input className="filter-input" style={{ paddingLeft: 32, width: 240 }} placeholder="Поиск по имени, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterRole} onChange={e => setRole(e.target.value)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 7, color: '#8aacbf', fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}>
          <option value="all">Все роли</option>
          {ROLES.map(r => <option key={r} value={r} style={{ background: 'var(--bg-panel)' }}>{ROLE_LABELS[r]} ({grouped[r] ?? 0})</option>)}
        </select>
      </div>

      {/* Stats strip */}
      <div style={{ padding: '8px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexShrink: 0, flexWrap: 'wrap' }}>
        {ROLES.map(r => grouped[r] ? (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RoleBadge role={r} />
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{grouped[r]}</span>
          </div>
        ) : null)}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>👤</div>
            <div>Пользователи не найдены</div>
          </div>
        )}
        {filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Пользователь', 'Email', 'Телефон', 'Роль', 'Статус', 'Дата регистрации', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', position: 'sticky', top: 0, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const color = avatarColor(u.id)
                const isSelf = u.id === currentUser?.id
                return (
                  <tr key={u.id} style={{ cursor: 'default' }}>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: color + '44', color, border: `1px solid ${color}33` }}>
                          {initials(u.full_name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                            {u.full_name}
                            {isSelf && <span style={{ marginLeft: 6, fontSize: 9, background: '#1a3a5c', color: '#62b8f5', padding: '1px 5px', borderRadius: 3 }}>ВЫ</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-2)', fontSize: 12 }}>{u.email}</td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-3)', fontSize: 12 }}>{u.phone ?? '—'}</td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)' }}><RoleBadge role={u.role} /></td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)' }}>
                      {u.is_active
                        ? <span className="chip chip-green"><span className="chip-dot" style={{ background: 'var(--green)' }} />Активен</span>
                        : <span className="chip chip-red"><span className="chip-dot" style={{ background: 'var(--red)' }} />Заблокирован</span>}
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(u.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-inner)' }}>
                      {isAdmin && (
                        <button onClick={() => setEdit(u)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 6, color: '#62b8f5', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✏ Изменить
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreate(false)} onCreated={refetch} />
      <EditUserModal user={editTarget} open={!!editTarget} onClose={() => setEdit(null)} onSaved={refetch} />
    </div>
  )
}
