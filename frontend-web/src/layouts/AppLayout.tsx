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

  function timeAgo(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 60) return `${m} мин назад`
    return `${Math.floor(m / 60)} ч назад`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="md3-icon-btn" onClick={() => setOpen((o) => !o)} title="Уведомления">
        <span className="ic" aria-hidden>notifications</span>
        {count > 0 && <span className="md3-icon-btn__dot" />}
      </button>
      {open && (
        <div className="md3-menu" role="menu">
          <div className="md3-menu__header">
            <span className="md3-menu__title">Критичные заявки</span>
            <span className="md3-menu__link" onClick={() => { navigate('/tickets'); setOpen(false) }}>Все →</span>
          </div>
          <div className="md3-menu__body">
            {tickets.length === 0 && (
              <div className="md3-menu__empty">Нет активных заявок 🎉</div>
            )}
            {tickets.map((t) => {
              const cls = t.priority === 'critical' ? 'md3-menu__item--critical'
                       : t.priority === 'high'      ? 'md3-menu__item--high'
                       : 'md3-menu__item--normal'
              const chipCls = t.priority === 'critical' ? 'md3-status-chip--critical'
                            : t.priority === 'high'     ? 'md3-status-chip--high'
                            : 'md3-status-chip--normal'
              return (
                <div key={t.id} className={`md3-menu__item ${cls}`} onClick={() => { navigate('/tickets'); setOpen(false) }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span className={`md3-status-chip ${chipCls}`}>{t.priority.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', fontFamily: 'ui-monospace, monospace' }}>{t.ticket_number}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface)', fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{timeAgo(t.created_at)}</div>
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

type NavDef = {
  key: string
  icon: string   // Material Symbol name
  label: string
  path: string
  badge?: string
  badgeRed?: boolean
  show: boolean
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

  const NAV_ITEMS: NavDef[] = [
    { key: 'dashboard', icon: 'space_dashboard', label: 'Дашборд',     path: '/dashboard', show: true },
    { key: 'objects',   icon: 'apartment',       label: 'Объекты',     path: '/objects',
      badge: !access.readOnly && stats ? String(stats.total_objects) : undefined,
      show: true },
    { key: 'journals',  icon: 'description',     label: 'Журналы ТО',  path: '/journals',
      show: !access.isCustomer && !access.isAuditor },
    { key: 'tickets',   icon: 'build',           label: 'Заявки',      path: '/tickets',
      badge: !access.readOnly && stats ? String(stats.open_tickets) : undefined, badgeRed: true,
      show: true },
    { key: 'schedule',  icon: 'event',           label: 'Планировщик', path: '/schedule',
      show: !access.isCustomer && !access.isAuditor },
    { key: 'routes',    icon: 'route',           label: 'Маршруты',    path: '/routes',
      show: !access.isCustomer && !access.isAuditor },
    { key: 'users',     icon: 'group',           label: 'Пользователи', path: '/users',
      show: access.canManageUsers },
    { key: 'settings',  icon: 'settings',        label: 'Настройки',   path: '/settings', show: true },
  ].filter(n => n.show)

  useEffect(() => {
    const iv = setInterval(() => setTime(now()), 30_000)
    return () => clearInterval(iv)
  }, [])

  const active = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.key ?? 'dashboard'
  const initials = user?.full_name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'АД'

  return (
    <div className="md3-shell">
      {/* DRAWER */}
      <aside className={`md3-drawer ${collapsed ? 'md3-drawer--collapsed' : ''}`}>
        <div className="md3-drawer__header">
          <div className="md3-drawer__logo" aria-hidden>shield</div>
          {!collapsed && (
            <div className="md3-drawer__brand">
              <span className="md3-drawer__brand-name">SecureTO</span>
              <span className="md3-drawer__brand-meta">v1.0.0</span>
            </div>
          )}
        </div>

        {!collapsed && <div className="md3-drawer__section">Навигация</div>}
        <nav className="md3-drawer__nav">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key
            return (
              <div key={item.key}
                className={`md3-nav-item ${isActive ? 'md3-nav-item--active' : ''}`}
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
              >
                <span className="md3-nav-item__icon" aria-hidden>{item.icon}</span>
                {!collapsed && <span className="md3-nav-item__label">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className={`md3-nav-item__badge ${item.badgeRed ? '' : 'md3-nav-item__badge--neutral'}`}>{item.badge}</span>
                )}
              </div>
            )
          })}
        </nav>

        <div className="md3-drawer__footer">
          {!collapsed && user && (() => {
            const [rbg, rc] = ROLE_COLORS[user.role] ?? ROLE_COLORS.AUDITOR
            return (
              <div className="md3-drawer__user-card">
                <div className="md3-drawer__user-name">{user.full_name}</div>
                <div className="md3-drawer__user-role">
                  <span style={{ background: rbg, color: rc, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </div>
              </div>
            )
          })()}
          <button className="md3-drawer__logout-btn" onClick={logout} title="Выход">
            <span className="ic" aria-hidden>logout</span>
            {!collapsed && 'Выйти'}
          </button>
          <button
            className="md3-drawer__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            <span className="ic" aria-hidden>{collapsed ? 'chevron_right' : 'chevron_left'}</span>
            {!collapsed && 'Свернуть'}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="md3-main">
        <header className="md3-appbar">
          <h1 className="md3-appbar__title">
            {NAV_ITEMS.find((n) => n.key === active)?.label ?? 'Дашборд'}
          </h1>

          <button
            className="md3-appbar__search"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            title="Поиск (Ctrl+K)"
          >
            <span className="ic" aria-hidden>search</span>
            <span>Поиск</span>
            <kbd>Ctrl+K</kbd>
          </button>

          <span className="md3-appbar__time">
            <span className="ic" aria-hidden>schedule</span>
            {time}
          </span>

          <NotificationBell tickets={urgentTickets} count={urgentCount} navigate={navigate} />

          <div className="md3-avatar" onClick={() => navigate('/profile')} title="Мой профиль">
            {initials}
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </div>

      <AIChatPanel />
      <GlobalSearch />
    </div>
  )
}
