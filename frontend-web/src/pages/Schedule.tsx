import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { scheduleApi, objectsApi, usersApi } from '../api/services'
import { downloadCSV } from '../utils/csvExport'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import type { MaintenanceSchedule, MaintenanceScheduleCreate, ObjectItem } from '../api/types'
import Modal from '../components/Modal'
import { FormField, inputCss, selectCss, textareaCss } from '../components/FormField'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

const STATUS_LABELS: Record<string, string> = { planned: 'Запланировано', done: 'Выполнено', overdue: 'Просрочено', cancelled: 'Отменено' }
const STATUS_CHIP: Record<string, string>   = { planned: 'chip-blue', done: 'chip-green', overdue: 'chip-red', cancelled: 'chip-gray' }

// ── Create Schedule Modal ─────────────────────────────────────────────────────
function CreateScheduleModal({ open, onClose, onCreated, month, year }: {
  open: boolean; onClose: () => void; onCreated: () => void; month: number; year: number
}) {
  const { data: objectsData }     = useApi(() => objectsApi.list({ size: 200 }))
  const { data: techniciansData } = useApi(() => usersApi.list())
  const [form, setForm] = useState({ object_id: '', technician_id: '', scheduled_date: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, loading, error } = useMutation((d: MaintenanceScheduleCreate) => scheduleApi.create(d))

  function f(k: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value })) }

  async function submit() {
    const e: Record<string, string> = {}
    if (!form.object_id) e.object = 'Выберите объект'
    if (!form.scheduled_date) e.date = 'Укажите дату'
    setErrors(e)
    if (Object.keys(e).length) return
    const result = await mutate({ object_id: form.object_id, technician_id: form.technician_id || undefined, scheduled_date: form.scheduled_date, month: month + 1, year, schedule_type: 'planned', notes: form.notes || undefined })
    if (result) { setForm({ object_id: '', technician_id: '', scheduled_date: '', notes: '' }); onCreated(); onClose() }
  }

  return (
    <Modal open={open} title="Добавить в план ТО" onClose={onClose} onConfirm={submit} confirmLoading={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <FormField label="Объект" required error={errors.object}>
          <select style={selectCss} value={form.object_id} onChange={f('object_id')}>
            <option value="" style={{ background: '#0d1d2c' }}>— Выбрать объект —</option>
            {(objectsData?.items ?? []).map(o => <option key={o.id} value={o.id} style={{ background: '#0d1d2c' }}>{o.name}</option>)}
          </select>
        </FormField>
        <FormField label="Монтажник">
          <select style={selectCss} value={form.technician_id} onChange={f('technician_id')}>
            <option value="" style={{ background: '#0d1d2c' }}>— Не назначен —</option>
            {(techniciansData ?? []).filter(u => u.role === 'TECHNICIAN' && u.is_active).map(u => <option key={u.id} value={u.id} style={{ background: '#0d1d2c' }}>{u.full_name}</option>)}
          </select>
        </FormField>
        <FormField label="Дата ТО" required error={errors.date}>
          <input type="date" style={inputCss} value={form.scheduled_date} onChange={f('scheduled_date')} />
        </FormField>
        <FormField label="Примечания"><textarea style={textareaCss} value={form.notes} onChange={f('notes')} placeholder="Необязательно…" /></FormField>
      </div>
    </Modal>
  )
}

// ── Schedule Page ─────────────────────────────────────────────────────────────
export default function Schedule() {
  const navigate = useNavigate()
  const access   = getAccess(useAuthStore(s => s.user?.role))
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear]   = useState(now.getFullYear())

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const [filterTech, setFilterTech]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [createOpen, setCreate] = useState(false)
  const { mutate: markDone, loading: marking } = useMutation(
    (id: string) => scheduleApi.update(id, { status: 'done' } as Partial<MaintenanceSchedule>)
  )

  const { data, loading, refetch } = useApi(
    () => scheduleApi.list({ month: month + 1, year, technician_id: filterTech || undefined, status: filterStatus !== 'all' ? filterStatus : undefined, size: 500 }),
    [month, year, filterTech, filterStatus],
  )
  const { data: stats }           = useApi(() => scheduleApi.stats(month + 1, year), [month, year])
  const { data: techniciansData } = useApi(() => usersApi.list())
  const { data: objectsData }     = useApi(() => objectsApi.list({ size: 200 }))

  const objectMap = useMemo<Record<string, ObjectItem>>(() => {
    const m: Record<string, ObjectItem> = {}
    objectsData?.items.forEach(o => { m[o.id] = o })
    return m
  }, [objectsData])

  const items      = data?.items ?? []
  const technicians = (techniciansData ?? []).filter(u => u.role === 'TECHNICIAN')

  const done    = stats?.done    ?? items.filter(s => s.status === 'done').length
  const overdue = stats?.overdue ?? items.filter(s => s.status === 'overdue').length
  const total   = data?.total    ?? items.length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          <span style={{ color: '#4d7a9e' }}>Дашборд</span><span style={{ color: '#2a4460', margin: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text-1)' }}>Планировщик ТО</span>
        </span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Загрузка…</span>}
        {access.canExport && <button className="topbar-btn btn-outline" onClick={() => {
          downloadCSV([
            ['Объект', 'Монтажник', 'Дата ТО', 'Статус', 'Тип', 'Примечания'],
            ...items.map(s => [
              objectMap[s.object_id]?.name ?? s.object_id,
              technicians.find(t => t.id === s.technician_id)?.full_name ?? '—',
              new Date(s.scheduled_date).toLocaleDateString('ru-RU'),
              STATUS_LABELS[s.status],
              s.schedule_type === 'planned' ? 'Плановое' : 'Внеплановое',
              s.notes ?? '',
            ]),
          ], `schedule_${MONTHS[month]}_${year}.csv`)
        }}>⬇ Экспорт плана</button>}
        {access.canCreateSchedule && <button className="topbar-btn btn-primary" onClick={() => setCreate(true)}>+ Добавить</button>}
      </div>

      {/* Summary strip */}
      <div style={{ padding: '10px 20px', background: '#0b1825', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' as const }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prevMonth} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', minWidth: 140, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶</button>
        </div>
        <div style={{ height: 24, width: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
          <span style={{ color: 'var(--text-3)' }}>Всего: <span style={{ color: '#62b8f5', fontWeight: 600 }}>{total}</span></span>
          <span style={{ color: 'var(--text-3)' }}>Выполнено: <span style={{ color: 'var(--green)', fontWeight: 600 }}>{done}</span></span>
          <span style={{ color: 'var(--text-3)' }}>Просрочено: <span style={{ color: 'var(--red)', fontWeight: 600 }}>{overdue}</span></span>
          {total > 0 && <span style={{ color: 'var(--text-3)' }}>Прогресс: <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{Math.round(done / total * 100)}%</span></span>}
        </div>
        {/* Filters */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <select value={filterTech} onChange={e => setFilterTech(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 7, color: '#8aacbf', fontSize: 12, padding: '6px 10px', outline: 'none', fontFamily: 'inherit' }}>
            <option value="">Все монтажники</option>
            {technicians.map(t => <option key={t.id} value={t.id} style={{ background: 'var(--bg-panel)' }}>{t.full_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 7, color: '#8aacbf', fontSize: 12, padding: '6px 10px', outline: 'none', fontFamily: 'inherit' }}>
            <option value="all">Все статусы</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: 'var(--bg-panel)' }}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {items.length === 0 && !loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📅</div>
              <div>Записей нет. Нажмите «+ Добавить»</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Объект','Монтажник','Дата ТО','Статус','Тип',''].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', position: 'sticky', top: 0, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(s => {
                  const tech = technicians.find(t => t.id === s.technician_id)
                  return (
                    <tr key={s.id} style={{ cursor: 'default' }}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-1)', fontWeight: 500, maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{objectMap[s.object_id]?.name ?? s.object_id.slice(0, 8) + '…'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                        {tech ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a5c8a55', color: '#62b8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                              {tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                            </div>
                            <span style={{ color: 'var(--text-2)' }}>{tech.full_name}</span>
                          </div>
                        ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{new Date(s.scheduled_date).toLocaleDateString('ru-RU')}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                        <span className={`chip ${STATUS_CHIP[s.status]}`}>{STATUS_LABELS[s.status]}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-3)' }}>
                        {s.schedule_type === 'planned' ? 'Плановое' : 'Внеплановое'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                        {s.status !== 'done' && s.status !== 'cancelled' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {access.canCreateJournal && <button
                            onClick={() => navigate('/journals', { state: { createJournalForObject: s.object_id } })}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 6, color: '#62b8f5', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>📋 Журнал</button>}
                          {access.canMarkScheduleDone && <button
                            disabled={marking}
                            onClick={async () => { await markDone(s.id); refetch() }}
                            style={{ background: 'var(--green-bg)', border: '1px solid #1a4030', borderRadius: 6, color: 'var(--green)', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>✓ Выполнено</button>}
                        </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Tech load sidebar */}
        {technicians.length > 0 && (
          <div style={{ width: 260, minWidth: 240, background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>👷 Нагрузка</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {technicians.map(tech => {
                const techItems = items.filter(s => s.technician_id === tech.id)
                const techDone  = techItems.filter(s => s.status === 'done').length
                const pct = techItems.length ? Math.round(techDone / techItems.length * 100) : 0
                const initials = tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)
                return (
                  <div key={tech.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a5c8a55', color: '#62b8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{initials}</div>
                        <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{tech.full_name.split(' ')[0]} {tech.full_name.split(' ')[1]?.charAt(0)}.</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{techDone}/{techItems.length}</span>
                    </div>
                    <div className="progress-track">
                      <div className={`progress-fill ${pct >= 70 ? 'progress-green' : pct >= 40 ? 'progress-yellow' : 'progress-red'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <CreateScheduleModal open={createOpen} onClose={() => setCreate(false)} onCreated={refetch} month={month} year={year} />
    </div>
  )
}
