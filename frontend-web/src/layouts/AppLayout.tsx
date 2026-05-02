import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useApi } from '../api/useApi'
import { dashboardApi, ticketsApi } from '../api/services'
import { ROLE_LABELS, ROLE_COLORS, getAccess } from '../utils/roles'
import GlobalSearch from '../components/GlobalSearch'
import AIChatPanel from '../components/AIChatPanel'
import type { RepairTicket } from '../api/types'

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell({ tickets, count, navigate }: { tickets: RepairTicket[]; count: number; navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const PRIO: Record<string, [string, string]> = {
    critical: ['var(--red-bg)', 'var(--red)'],
    high:     ['var(--orange-bg)', 'var(--orange)'],
    normal:   ['#0d2040', '#62b8f5'],
  }

  function timeAgo(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 60) return `${m} мин назад`
    return `${Math.floor(m / 60)} ч назад`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        🔔
        {count > 0 && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, background: '#e74c3c', borderRadius: '50%', border: '2px solid var(--bg-panel)' }} />
        )}
      </div>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 36, width: 340, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px #000a', zIndex: 100, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Критичные заявки</span>
            <span onClick={() => { navigate('/tickets'); setOpen(false) }} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer' }}>Все →</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {tickets.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>Нет активных заявок 🎉</div>
            )}
            {tickets.map(t => {
              const [bg, color] = PRIO[t.priority] ?? PRIO.normal
              return (
                <div key={t.id} onClick={() => { navigate('/tickets'); setOpen(false) }}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-inner)', cursor: 'pointer', borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ background: bg, color, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>{t.priority.toUpperCase()}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t.ticket_number}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500, marginBottom: 2 }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{timeAgo(t.created_at)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function now() {
  return new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AppLayout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const user      = useAuthStore((s) => s.user)
  const logout    = useAuthStore((s) => s.logout)
  const [collapsed, setCollapsed] = useState(false)
  const [time, setTime] = useState(now())
  const { data: stats, refetch: refetchStats }             = useApi(() => dashboardApi.stats())
  const { data: criticalTickets, refetch: refetchCritical } = useApi(() => ticketsApi.list({ size: 10, priority: 'critical', status: 'new' }))
  const { data: highTickets, refetch: refetchHigh }         = useApi(() => ticketsApi.list({ size: 5, priority: 'high', status: 'new' }))

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    const iv = setInterval(() => {
      refetchStats(); refetchCritical(); refetchHigh()
    }, 30_000)
    return () => clearInterval(iv)
  }, [])
  const urgentTickets = [
    ...(criticalTickets?.items ?? []),
    ...(highTickets?.items ?? []).filter(t => t.status !== 'resolved' && t.status !== 'closed'),
  ].filter(t => t.status !== 'resolved' && t.status !== 'closed').slice(0, 8)
  const urgentCount = stats?.critical_tickets ?? urgentTickets.length

  const access = getAccess(user?.role)

  // Nav items filtered by role:
  // CUSTOMER/AUDITOR — только дашборд + объекты + заявки (readonly)
  // TECHNICIAN       — дашборд + объекты (свои) + журналы (свои) + заявки (свои) + расписание (своё)
  // DISPATCHER       — всё кроме пользователей, акцент на заявки/перезвоны
  // MANAGER/ADMIN    — полный доступ
  const NAV_ITEMS = [
    { key: 'dashboard', icon: '⊞', label: 'Дашборд',       path: '/dashboard', show: true },
    { key: 'objects',   icon: '🏢', label: 'Объекты',       path: '/objects',
      badge: !access.readOnly && stats ? String(stats.total_objects) : undefined,
      show: true },
    { key: 'journals',  icon: '📋', label: 'Журналы ТО',    path: '/journals',
      show: !access.isCustomer && !access.isAuditor },
    { key: 'tickets',   icon: '🔧', label: 'Заявки',        path: '/tickets',
      badge: !access.readOnly && stats ? String(stats.open_tickets) : undefined, badgeRed: true,
      show: true },
    { key: 'schedule',  icon: '📅', label: 'Планировщик',   path: '/schedule',
      show: !access.isCustomer && !access.isAuditor },
    { key: 'users',     icon: '👤', label: 'Пользователи',  path: '/users',
      show: access.canManageUsers },
    { key: 'settings',  icon: '⚙',  label: 'Настройки',     path: '/settings', show: true },
  ].filter(n => n.show)

  useEffect(() => {
    const iv = setInterval(() => setTime(now()), 30_000)
    return () => clearInterval(iv)
  }, [])

  const active = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.key ?? 'dashboard'
  const initials = user?.full_name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'АД'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* SIDEBAR */}
      <aside style={{
        width: collapsed ? 60 : 220, minWidth: collapsed ? 60 : 220,
        background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s', zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 18px 16px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)', overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <div style={{
            width: 32, height: 32, minWidth: 32, background: 'var(--blue)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🛡</div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e8f1fa' }}>SecureTO</div>
              <div style={{ fontSize: 10, color: '#5a7a96' }}>v1.0.0</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {!collapsed && (
            <div style={{ fontSize: 10, fontWeight: 600, color: '#3d5a72', letterSpacing: 1, padding: '12px 18px 4px', textTransform: 'uppercase' }}>
              Навигация
            </div>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key
            return (
              <div key={item.key}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 18px', cursor: 'pointer',
                  fontSize: 13.5, color: isActive ? '#62b8f5' : '#7a9ab5',
                  background: isActive ? 'linear-gradient(90deg,#1a3a5c 0%,transparent 100%)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                  transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 16, minWidth: 20, textAlign: 'center' }}>{item.icon}</span>
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {!collapsed && item.badge && (
                  <span style={{
                    background: item.badgeRed ? '#c0392b' : '#d97706',
                    color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px',
                  }}>{item.badge}</span>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* User info strip */}
          {!collapsed && user && (() => {
            const [rbg, rc] = ROLE_COLORS[user.role] ?? ROLE_COLORS.AUDITOR
            return (
              <div style={{ padding: '8px 10px', background: '#091624', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ background: rbg, color: rc, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3 }}>{ROLE_LABELS[user.role] ?? user.role}</span>
                </div>
              </div>
            )
          })()}
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '10px 12px', marginBottom: 0,
              background: 'linear-gradient(135deg,#0e2a42,#102638)',
              border: '1px solid #1a7dbd44', borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10, color: '#62b8f5',
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}
            title="Выход"
          >
            <span style={{ fontSize: 14, minWidth: 20 }}>↩</span>
            {!collapsed && <span style={{ fontSize: 12.5, fontWeight: 600 }}>Выйти</span>}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{
              width: '100%', padding: 8, background: '#112030',
              border: '1px solid #1e3347', borderRadius: 6, color: '#4d7a9e',
              cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{collapsed ? '▶' : '◀'}</button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* TOPBAR */}
        <div style={{
          height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>
            {NAV_ITEMS.find((n) => n.key === active)?.label ?? 'Дашборд'}
          </div>
          {/* Search button — opens GlobalSearch modal */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            title="Поиск (Ctrl+K)"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-3)', fontSize: 12, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            🔍 <span style={{ color: 'var(--text-4)' }}>Ctrl+K</span>
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>⏱ {time}</span>
          <NotificationBell tickets={urgentTickets} count={urgentCount} navigate={navigate} />
          <div onClick={() => navigate('/profile')} title="Мой профиль" style={{
            width: 30, height: 30, background: '#1a3a5c', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#62b8f5', fontWeight: 700, cursor: 'pointer',
            border: '1px solid #1a7dbd44',
          }}>
            {initials}
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </div>
      {/* AI Chat Panel — floating widget */}
      <AIChatPanel />
      {/* Global search modal — rendered at root level, opened with Ctrl+K */}
      <GlobalSearch />
    </div>
  )
}
