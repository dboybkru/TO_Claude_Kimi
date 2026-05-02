import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { dashboardApi, ticketsApi, objectsApi, voiceApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import type { DistrictStat, TechnicianStat } from '../api/services'
import type { DashboardStats, RepairTicket, ObjectItem } from '../api/types'

// ── Static fallback data (used when backend is down) ─────────────────────────
const MOCK_STATS: DashboardStats = {
  total_objects: 127, active_objects: 124,
  maintenance_done_this_month: 44, maintenance_planned_this_month: 61,
  overdue_count: 7, open_tickets: 14, critical_tickets: 4, high_tickets: 5,
}

const MOCK_TICKETS = [
  { id: 'REQ-2026-0842', priority: 'critical', title: 'Отказ ОПС — нет связи с контрольной панелью', address: 'ул. Ленина, 45, ТЦ «Орион»', assignee: 'Петров А.', time: '10 мин назад', status: 'Открыта' },
  { id: 'REQ-2026-0841', priority: 'critical', title: 'Неисправность СКУД — не работают 3 точки прохода', address: 'пр. Мира, 18, Бизнес-центр', assignee: 'Козлов Н.', time: '25 мин назад', status: 'В работе' },
  { id: 'REQ-2026-0840', priority: 'high', title: 'Замена АКБ резервного питания', address: 'ул. Садовая, 7, Склад № 3', assignee: null, time: '1 ч назад', status: 'Открыта' },
  { id: 'REQ-2026-0839', priority: 'high', title: 'Ложные срабатывания ИК-извещателей, зона Б', address: 'ул. Гагарина, 12, Офис', assignee: 'Иванов С.', time: '2 ч назад', status: 'В работе' },
  { id: 'REQ-2026-0838', priority: 'medium', title: 'Плановое ТО — проверка датчиков дыма', address: 'пр. Октября, 88, Завод', assignee: 'Смирнов Р.', time: '3 ч назад', status: 'Назначена' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="progress-track">
      <div className={`progress-fill progress-${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PriorityBadge({ p }: { p: string }) {
  const m: Record<string, [string, string]> = {
    critical: ['var(--red-bg)',    'var(--red)'],
    high:     ['var(--orange-bg)', 'var(--orange)'],
    medium:   ['#0d2040',          '#62b8f5'],
  }
  const [bg, color] = m[p] ?? m.medium
  const labels: Record<string, string> = { critical: 'КРИТИЧНО', high: 'ВЫСОКИЙ', medium: 'СРЕДНИЙ', normal: 'СРЕДНИЙ', low: 'НИЗКИЙ' }
  return <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4 }}>{labels[p] ?? p.toUpperCase()}</span>
}

function StatusChip({ status }: { status: string }) {
  if (status === 'overdue') return <span className="chip chip-red"><span className="chip-dot" style={{ background: 'var(--red)' }} />Просрочено</span>
  if (status === 'warn' || status === 'in_repair') return <span className="chip chip-orange"><span className="chip-dot" style={{ background: 'var(--orange)' }} />Скоро ТО</span>
  return <span className="chip chip-green"><span className="chip-dot" style={{ background: 'var(--green)' }} />В норме</span>
}

// ── Metric Cards ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent, icon }: {
  label: string; value: string | number; sub: React.ReactNode; accent: string; icon: string
}) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden', flex: 1 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
      <div style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: 0.12 }}>{icon}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ── Tickets Feed ─────────────────────────────────────────────────────────────

function TicketsFeed({ tickets, loading }: { tickets: RepairTicket[] | null; loading: boolean }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)

  const items = tickets ?? MOCK_TICKETS as unknown as RepairTicket[]
  const filtered = filter === 'all' ? items : items.filter((t) => t.priority === filter)

  function priorityOf(t: RepairTicket) { return t.priority }
  function titleOf(t: RepairTicket)    { return t.title }
  function timeOf(t: RepairTicket) {
    if (!t.created_at) return (t as unknown as { time?: string }).time ?? ''
    const diff = Date.now() - new Date(t.created_at).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m} мин назад`
    return `${Math.floor(m / 60)} ч назад`
  }

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="pulse-dot" /> Критичные заявки
          {loading && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>…</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'critical', 'high'] as const).map((f) => (
            <span key={f} onClick={() => setFilter(f)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: filter === f ? '#1a3a5c' : 'transparent', color: filter === f ? '#62b8f5' : 'var(--text-4)', border: `1px solid ${filter === f ? '#1a7dbd44' : 'var(--border)'}` }}>
              {f === 'all' ? 'Все' : f === 'critical' ? 'Критичные' : 'Высокие'}
            </span>
          ))}
          <span className="panel-action" onClick={() => navigate('/tickets')}>Все заявки →</span>
        </div>
      </div>
      <div className="panel-body">
        {filtered.map((t) => (
          <div key={t.id} onClick={() => setSelected(t.id === selected ? null : t.id)}
            style={{ background: selected === t.id ? '#0c1e2e' : 'var(--bg-card)', border: `1px solid ${selected === t.id ? '#1a7dbd88' : 'var(--border-mid)'}`, borderLeft: `3px solid ${priorityOf(t) === 'critical' ? 'var(--red)' : priorityOf(t) === 'high' ? 'var(--orange)' : 'var(--blue)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t.ticket_number ?? (t as unknown as {id: string}).id}</span>
              <PriorityBadge p={priorityOf(t)} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 4 }}>{titleOf(t)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              📍 {(t as unknown as {address?: string}).address ?? t.object_id ?? '—'}
              <span style={{ float: 'right', color: 'var(--text-4)' }}>{timeOf(t)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Districts Panel ───────────────────────────────────────────────────────────

function DistrictsPanel({ districts, loading }: { districts: DistrictStat[] | null; loading: boolean }) {
  const now = new Date()
  const items: DistrictStat[] = districts && districts.length > 0 ? districts : [
    { name: 'Центральный', done: 12, pending: 3, total: 15, overdue: 1 },
    { name: 'Северный',    done: 8,  pending: 5, total: 13, overdue: 2 },
    { name: 'Южный',       done: 5,  pending: 7, total: 12, overdue: 3 },
    { name: 'Западный',    done: 10, pending: 2, total: 12, overdue: 0 },
    { name: 'Восточный',   done: 6,  pending: 4, total: 10, overdue: 1 },
  ]
  return (
    <div className="panel" style={{ width: 340, minWidth: 300 }}>
      <div className="panel-header">
        <div className="panel-title">📍 ТО по районам {loading && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>…</span>}</div>
        <span className="panel-action">{now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((d) => {
          const pct = d.total > 0 ? Math.round((d.done / d.total) * 100) : 0
          const color = pct >= 80 ? 'green' : pct >= 50 ? 'blue' : d.overdue > 0 ? 'red' : 'yellow'
          return (
            <div key={d.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: '#a0bdd0' }}>{d.name}</span>
                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>{d.done} вып</span>
                  <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{d.pending} ожид</span>
                  <span style={{ color: '#62b8f5', fontWeight: 600 }}>{pct}%</span>
                </div>
              </div>
              <ProgressBar pct={pct} color={color} />
              {d.overdue > 0 && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>⚠ Просрочено: {d.overdue}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Objects Table ─────────────────────────────────────────────────────────────

function ObjectsTable({ objects, loading }: { objects: ObjectItem[] | null; loading: boolean }) {
  const navigate = useNavigate()
  const MOCK_OBJECTS = [
    { id: 'ОБЖ-101', name: 'ТЦ «Орион»',             type: 'OS_OTS', district: 'Центральный', lastTO: '15.11.2024', nextTO: '15.02.2025', status: 'overdue' as const, overdueDays: 71, tickets: 2 },
    { id: 'ОБЖ-045', name: 'БЦ «Горизонт»',           type: 'SKUD',   district: 'Северный',   lastTO: '10.01.2025', nextTO: '10.04.2025', status: 'overdue' as const, overdueDays: 17, tickets: 1 },
    { id: 'ОБЖ-067', name: 'Склад № 3 ООО «Логист»',  type: 'OS',     district: 'Южный',      lastTO: '20.12.2024', nextTO: '20.03.2025', status: 'warn' as const,    overdueDays: null, tickets: 1 },
    { id: 'ОБЖ-089', name: 'Офис «Арсенал»',           type: 'OS_OTS', district: 'Западный',   lastTO: '05.01.2025', nextTO: '05.04.2025', status: 'warn' as const,    overdueDays: null, tickets: 0 },
    { id: 'ОБЖ-112', name: 'Завод «Энергомаш»',        type: 'OS',     district: 'Восточный',  lastTO: '01.02.2025', nextTO: '01.05.2025', status: 'active' as const,  overdueDays: null, tickets: 0 },
  ]

  type Row = typeof MOCK_OBJECTS[0] | (ObjectItem & { overdueDays?: number | null; district?: string; lastTO?: string; nextTO?: string; tickets?: number })
  const rows: Row[] = objects && objects.length > 0 ? objects as Row[] : MOCK_OBJECTS

  return (
    <div className="panel" style={{ flex: 1, minWidth: 0 }}>
      <div className="panel-header">
        <div className="panel-title">🏢 Объекты с нарушениями {loading && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>…</span>}</div>
        <span className="panel-action" onClick={() => navigate('/objects')}>Показать все →</span>
      </div>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['ID', 'Объект', 'Район', 'Посл. ТО', 'След. ТО', 'Статус', 'Просрочка', 'Заявки'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', position: 'sticky', top: 0, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((obj) => {
              const isReal = 'created_at' in obj
              const statusKey = isReal ? (obj as ObjectItem).status : (obj as typeof MOCK_OBJECTS[0]).status
              return (
                <tr key={obj.id} style={{ cursor: 'pointer' }}>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 10, color: 'var(--text-4)', borderBottom: '1px solid var(--border-inner)' }}>{(obj as { id: string }).id?.slice(0, 8)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                    <div style={{ color: 'var(--text-1)', fontWeight: 500, fontSize: 12.5 }}>{obj.name}</div>
                    <div style={{ color: 'var(--text-4)', fontSize: 10 }}>{obj.type}</div>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-2)', borderBottom: '1px solid var(--border-inner)' }}>{(obj as { district?: string }).district ?? (isReal ? (obj as ObjectItem).region : '') ?? '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-inner)' }}>
                    {isReal ? ((obj as ObjectItem).last_maintenance_at ? new Date((obj as ObjectItem).last_maintenance_at!).toLocaleDateString('ru-RU') : '—') : (obj as { lastTO?: string }).lastTO}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-inner)' }}>{(obj as { nextTO?: string }).nextTO ?? '—'}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-inner)' }}><StatusChip status={statusKey} /></td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                    {(obj as { overdueDays?: number | null }).overdueDays
                      ? <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 11 }}>+{(obj as { overdueDays: number }).overdueDays} дн.</span>
                      : <span style={{ color: 'var(--green)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                    {(obj as { tickets?: number }).tickets
                      ? <span style={{ background: 'var(--orange-bg)', color: 'var(--orange)', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{(obj as { tickets: number }).tickets} откр.</span>
                      : <span style={{ color: 'var(--text-4)', fontSize: 10 }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Technicians Panel ─────────────────────────────────────────────────────────

const TECH_COLORS = ['#1a5c8a', '#1a5a3a', '#5a1a6a', '#5a3a10', '#1a1a5a', '#5a1a1a']
function techColor(id: string) { return TECH_COLORS[id.charCodeAt(0) % TECH_COLORS.length] }

function TechCard({ tech }: { tech: TechnicianStat }) {
  const pct = tech.total > 0 ? Math.round((tech.done / tech.total) * 100) : 0
  const inits = tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = techColor(tech.id)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: color + '44', color, border: `1px solid ${color}33` }}>{inits}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{tech.full_name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{tech.phone ?? 'Монтажник'}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: tech.total > 0 ? 'var(--green-bg)' : '#141a1a', color: tech.total > 0 ? 'var(--green)' : 'var(--text-4)' }}>
          {tech.total > 0 ? 'Активен' : 'Нет задач'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Выполнено в месяце</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a0bdd0' }}>{tech.done}/{tech.total} ({pct}%)</span>
      </div>
      <ProgressBar pct={pct} color={pct >= 70 ? 'green' : pct >= 40 ? 'yellow' : 'red'} />
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

// ── Customer / Auditor Portal ─────────────────────────────────────────────────
function ReadOnlyPortal() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { data: ticketsData } = useApi(() => ticketsApi.list({ size: 20 }))
  const { data: objectsData } = useApi(() => objectsApi.list({ size: 50 }))

  const tickets = ticketsData?.items ?? []
  const objects = objectsData?.items ?? []
  const openTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed')

  const isCustomer = user?.role === 'CUSTOMER'
  const label = isCustomer ? 'Мои объекты' : 'Объекты'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {isCustomer ? '🏢' : '📊'}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e8f1fa' }}>
            Добро пожаловать, {user?.full_name?.split(' ')[0] ?? 'пользователь'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            SecureTO · {isCustomer ? 'Портал клиента' : 'Просмотр данных'}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: label, value: objects.length, icon: '🏢', accent: 'var(--blue)', onClick: () => navigate('/objects') },
          { label: 'Открытые заявки', value: openTickets.length, icon: '🔧', accent: openTickets.length > 0 ? 'var(--orange)' : 'var(--green)', onClick: () => navigate('/tickets') },
          { label: 'Решённые заявки', value: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length, icon: '✅', accent: 'var(--green)', onClick: () => navigate('/tickets') },
        ].map(card => (
          <div key={card.label} onClick={card.onClick}
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: card.accent }} />
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>{card.label}</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: card.accent, lineHeight: 1.1, marginTop: 4 }}>{card.value}</div>
            <div style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: 0.12 }}>{card.icon}</div>
          </div>
        ))}
      </div>

      {/* Recent tickets */}
      {openTickets.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><span className="pulse-dot" /> Открытые заявки</div>
            <span className="panel-action" onClick={() => navigate('/tickets')}>Все →</span>
          </div>
          <div style={{ padding: '0 16px 12px' }}>
            {openTickets.slice(0, 5).map(t => (
              <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-inner)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2, fontFamily: 'monospace' }}>{t.ticket_number}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: t.priority === 'critical' ? 'var(--red-bg)' : t.priority === 'high' ? 'var(--orange-bg)' : '#0d2040',
                  color: t.priority === 'critical' ? 'var(--red)' : t.priority === 'high' ? 'var(--orange)' : '#62b8f5' }}>
                  {t.priority.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {openTickets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>Нет открытых заявок</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Все системы работают штатно</div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const role   = useAuthStore(s => s.user?.role)
  const access = getAccess(role)

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  // All hooks MUST be called unconditionally — Rules of Hooks
  const { data: stats, loading: statsLoading, error: statsError } = useApi(() => dashboardApi.stats())
  const { data: ticketsData, loading: ticketsLoading }             = useApi(() => ticketsApi.list({ size: 10 }))
  const { data: objectsData, loading: objectsLoading }             = useApi(() => objectsApi.list({ size: 10 }))
  const { data: districts, loading: districtsLoading }             = useApi(() => dashboardApi.districts(month, year))
  const { data: technicians, loading: techsLoading }               = useApi(() => dashboardApi.technicians(month, year))

  // CUSTOMER and AUDITOR see a simplified portal — rendered AFTER all hooks
  if (access.readOnly) return <ReadOnlyPortal />

  const s           = statsError ? MOCK_STATS : (stats ?? MOCK_STATS)
  const tickets     = ticketsData?.items ?? null
  const objects     = objectsData?.items ?? null
  const activeTechs = (technicians ?? []).filter(t => t.total > 0).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, flexShrink: 0 }}>
        <MetricCard label="Всего объектов" value={s.total_objects} icon="🏢" accent="var(--blue)"
          sub={<>Активных: <span style={{ color: 'var(--green)' }}>{s.active_objects}</span></>} />
        <MetricCard label="ТО выполнено в месяце" value={s.maintenance_done_this_month} icon="✅" accent="#27ae60"
          sub={`из ${s.maintenance_planned_this_month} запланировано`} />
        <MetricCard label="Просрочено ТО" value={s.overdue_count} icon="⚠" accent="#c0392b"
          sub="объектов без обслуживания" />
        <MetricCard label="Открытые заявки" value={s.open_tickets} icon="🔧" accent="#d97706"
          sub={`${s.critical_tickets} критичных, ${s.high_tickets} высоких`} />
      </div>

      {/* Middle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, flex: '1 1 auto', minHeight: 260, overflow: 'hidden' }}>
        <TicketsFeed tickets={tickets} loading={ticketsLoading} />
        <DistrictsPanel districts={districts} loading={districtsLoading} />
      </div>

      {/* Bottom */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, flexShrink: 0 }}>
        <ObjectsTable objects={objects} loading={objectsLoading} />
        <div className="panel" style={{ width: 320, minWidth: 280 }}>
          <div className="panel-header">
            <div className="panel-title">👷 Монтажники — месяц {techsLoading && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>…</span>}</div>
            <span className="panel-action">{activeTechs} с задачами</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {(technicians ?? []).length === 0 && !techsLoading && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>Нет данных</div>
            )}
            {(technicians ?? []).map(t => <TechCard key={t.id} tech={t} />)}
          </div>
        </div>
      </div>

      {/* AI Daily Digest */}
      <AiDigestPanel />
    </div>
  )
}

// ── AI Daily Digest Panel ─────────────────────────────────────────────────────
function AiDigestPanel() {
  const [digest, setDigest] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const user = useAuthStore(s => s.user)

  const role = user?.role
  if (!role || role === 'CUSTOMER' || role === 'AUDITOR' || role === 'TECHNICIAN') return null

  async function generate() {
    setLoading(true)
    try {
      const res = await voiceApi.dailyDigest()
      setDigest(res.digest)
      setGeneratedAt(res.generated_at)
      setExpanded(true)
    } catch { setDigest('Не удалось сформировать дайджест.') }
    finally { setLoading(false) }
  }

  const timeStr = generatedAt ? new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid #1a3a5c', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
      <div onClick={() => digest && setExpanded(e => !e)}
        style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: digest ? 'pointer' : 'default', background: 'linear-gradient(90deg,#0a1f30,#0e1f2e)' }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#62b8f5' }}>AI Дайджест дня</span>
          {timeStr && <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 10 }}>обновлён в {timeStr}</span>}
          {!digest && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Сводка по всем объектам, рискам и просрочкам</div>}
        </div>
        {!digest && (
          <button disabled={loading} onClick={e => { e.stopPropagation(); generate() }}
            style={{ padding: '7px 16px', borderRadius: 8, background: loading ? '#1a2e42' : 'var(--blue)', color: loading ? 'var(--text-4)' : '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? '🤖 Анализирую…' : '▶ Сформировать'}
          </button>
        )}
        {digest && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={e => { e.stopPropagation(); generate() }} disabled={loading}
              style={{ padding: '4px 9px', borderRadius: 5, background: 'transparent', border: '1px solid #1a3a5c', color: 'var(--text-4)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loading ? '⏳' : '↻'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-4)', alignSelf: 'center' }}>{expanded ? '▲' : '▼'}</span>
          </div>
        )}
      </div>
      {expanded && digest && (
        <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-line', borderTop: '1px solid #1a3a5c', background: '#091624', maxHeight: 400, overflowY: 'auto' }}>
          {digest}
        </div>
      )}
    </div>
  )
}
