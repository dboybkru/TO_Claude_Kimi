import { useParams, useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { ticketsApi, usersApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { useState } from 'react'
import { selectCss, textareaCss } from '../components/FormField'

const PRIORITY_LABEL: Record<string,string> = { critical:'КРИТИЧНО', high:'ВЫСОКИЙ', normal:'СРЕДНИЙ', low:'НИЗКИЙ' }
const PRIORITY_CLS: Record<string,string> = {
  critical: 'md3-status-chip--critical',
  high:     'md3-status-chip--high',
  normal:   'md3-status-chip--normal',
  low:      'md3-status-chip--success',
}
const STATUS_LABEL: Record<string,string> = {
  new: 'Новая', callback_required: 'Перезвон', assigned: 'Назначена',
  in_progress: 'В работе', resolved: 'Решена', closed: 'Закрыта',
}
const STATUS_CLS: Record<string,string> = {
  new: 'md3-status-chip--normal',
  callback_required: 'md3-status-chip--high',
  assigned: 'md3-status-chip--normal',
  in_progress: 'md3-status-chip--normal',
  resolved: 'md3-status-chip--success',
  closed: 'md3-status-chip--neutral',
}
const SOURCE_LABEL: Record<string,string> = { voice_bot:'🤖 Голосовой бот', manual:'🤚 Вручную', journal_auto:'⚡ Авто из журнала' }
const FAULT_LABEL: Record<string,string>  = { hardware:'Оборудование', software:'ПО', power:'Питание', sensor:'Датчики', access:'Доступ', other:'Прочее' }

export default function TicketDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const access   = getAccess(user?.role)
  const [resolveNotes, setResolveNotes] = useState('')
  const [assignTechId, setAssignTechId] = useState('')
  const [showResolve, setShowResolve]   = useState(false)

  const { data: ticket, loading, refetch } = useApi(() => ticketsApi.get(id!), [id])
  const { data: technicians } = useApi(() => usersApi.list())
  const { mutate: doAssign,  loading: assigning } = useMutation(({ tid }: { tid: string }) => ticketsApi.assign(id!, tid))
  const { mutate: doResolve, loading: resolving } = useMutation((notes: string) => ticketsApi.resolve(id!, notes))

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--md-sys-color-on-surface-variant)' }}>Загрузка…</div>
  if (!ticket) return <div style={{ padding:40, textAlign:'center', color:'var(--md-sys-color-error)' }}>Тикет не найден</div>

  const isClosed = ['resolved','closed'].includes(ticket.status)
  const techs = (technicians ?? []).filter(u => u.role === 'TECHNICIAN' && u.is_active)

  async function handleAssign() {
    if (!assignTechId) return
    const r = await doAssign({ tid: assignTechId })
    if (r) { setAssignTechId(''); refetch() }
  }
  async function handleResolve() {
    if (!resolveNotes.trim()) return
    const r = await doResolve(resolveNotes)
    if (r) { setShowResolve(false); refetch() }
  }

  return (
    <div className="md3-page">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumbs" style={{ fontSize:13, color:'var(--md-sys-color-on-surface-variant)' }}>
        <span onClick={() => navigate('/tickets')} style={{ cursor:'pointer' }}>Заявки</span>
        <span style={{ margin:'0 8px', color:'var(--md-sys-color-outline)' }}>›</span>
        <span style={{ color:'var(--md-sys-color-on-surface)', fontWeight:500, fontFamily:'ui-monospace, monospace' }}>{ticket.ticket_number}</span>
      </nav>

      {/* Header */}
      <div className="md3-card" style={{ padding:'22px 24px' }}>
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <span className={`md3-status-chip ${PRIORITY_CLS[ticket.priority] ?? PRIORITY_CLS.normal}`}>{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</span>
          <span className={`md3-status-chip ${STATUS_CLS[ticket.status] ?? STATUS_CLS.new}`}>{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
          <span style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)' }}>{SOURCE_LABEL[ticket.source]}</span>
          {ticket.fault_type && <span style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)' }}>· {FAULT_LABEL[ticket.fault_type]}</span>}
        </div>
        <div style={{ fontSize:22, fontWeight:600, color:'var(--md-sys-color-on-surface)', marginBottom:10, lineHeight:'28px' }}>{ticket.title}</div>
        {ticket.description && (
          <div style={{ fontSize:13.5, color:'var(--md-sys-color-on-surface-variant)', background:'var(--md-sys-color-surface-container-low)', padding:'12px 16px', borderRadius:'var(--md-sys-shape-corner-small)', lineHeight:1.6 }}>
            {ticket.description}
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
        {/* Left: details */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Info card */}
          <div className="md3-card" style={{ padding:18 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:14 }}>Сведения</div>
            {(
              [
                ['Номер',         ticket.ticket_number],
                ['Источник',      SOURCE_LABEL[ticket.source]],
                ['Создана',       new Date(ticket.created_at).toLocaleString('ru-RU')],
                ticket.caller_phone ? ['Телефон',    ticket.caller_phone] : null,
                ticket.assigned_at  ? ['Назначена',  new Date(ticket.assigned_at).toLocaleString('ru-RU')] : null,
                ticket.resolved_at  ? ['Закрыта',    new Date(ticket.resolved_at).toLocaleString('ru-RU')] : null,
              ] as ([string, string] | null)[]
            ).filter((item): item is [string, string] => item !== null)
             .map(([l, v]) => (
              <div key={String(l)} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--md-sys-color-outline-variant)' }}>
                <span style={{ fontSize:13, color:'var(--md-sys-color-on-surface-variant)' }}>{l}</span>
                <span style={{ fontSize:13.5, color:'var(--md-sys-color-on-surface)', fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Resolution notes */}
          {ticket.resolution_notes && (
            <div style={{
              background:'#0E3B22', color:'#B6F0C2',
              borderRadius:'var(--md-sys-shape-corner-medium)',
              padding:18,
            }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Решение</div>
              <div style={{ fontSize:13.5, lineHeight:1.6 }}>{ticket.resolution_notes}</div>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Resolve */}
          {!isClosed && (access.canResolveTicket || ticket.assigned_to_id === user?.id) && (
            <div className="md3-card" style={{ padding:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:14 }}>Закрытие заявки</div>
              {!showResolve ? (
                <button onClick={() => setShowResolve(true)} className="md3-btn-tonal" style={{ width:'100%' }}>
                  <span className="ic" aria-hidden>check_circle</span>
                  Закрыть заявку
                </button>
              ) : (
                <>
                  <textarea style={{ ...textareaCss, marginBottom:10 }} value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="Описание выполненных работ…" />
                  <button disabled={!resolveNotes.trim() || resolving} onClick={handleResolve} className="md3-btn-filled" style={{ width:'100%' }}>
                    {resolving && <span className="md3-spinner" aria-hidden />}
                    {resolving ? 'Сохранение…' : 'Подтвердить'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Audio Player */}
          {ticket.call_recording_url && (
            <div className="md3-card" style={{ padding:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:14 }}>Запись звонка</div>
              <audio controls style={{ width:'100%', marginBottom:12 }} src={ticket.call_recording_url} />
              {ticket.source === 'voice_bot' && (
                <div style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)', display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily:'Material Symbols Rounded', fontSize:16 }}>smart_toy</span>
                  Источник: Голосовой робот
                </div>
              )}
              <div style={{ marginTop:14, padding:12, background:'var(--md-sys-color-surface-container-low)', borderRadius:'var(--md-sys-shape-corner-small)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', marginBottom:6 }}>AI Транскрипция</div>
                <div style={{ fontSize:13, color:'var(--md-sys-color-on-surface-variant)', fontStyle:'italic' }}>
                  Транскрипция будет доступна после обработки аудио…
                </div>
              </div>
            </div>
          )}

          {/* Assign */}
          {!isClosed && access.canAssignTicket && techs.length > 0 && (
            <div className="md3-card" style={{ padding:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:14 }}>Назначить монтажника</div>
              <select value={assignTechId} onChange={e => setAssignTechId(e.target.value)} style={{ ...selectCss, marginBottom:10 }}>
                <option value="">— Выбрать —</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
              <button disabled={!assignTechId || assigning} onClick={handleAssign} className="md3-btn-filled" style={{ width:'100%' }}>
                {assigning && <span className="md3-spinner" aria-hidden />}
                {assigning ? 'Назначение…' : 'Назначить'}
              </button>
            </div>
          )}

          {/* Currently assigned tech */}
          {ticket.assigned_to_id && (() => {
            const tech = (technicians ?? []).find(t => t.id === ticket.assigned_to_id)
            if (!tech) return null
            const inits = tech.full_name.split(' ').map(w => w[0]).join('').slice(0,2)
            return (
              <div className="md3-card" style={{ padding:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Исполнитель</div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{
                    width:40, height:40, borderRadius:'50%',
                    background:'var(--md-sys-color-primary-container)',
                    color:'var(--md-sys-color-on-primary-container)',
                    display:'grid', placeItems:'center',
                    fontSize:14, fontWeight:600,
                  }}>{inits}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--md-sys-color-on-surface)' }}>{tech.full_name}</div>
                    <div style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)' }}>{tech.phone ?? tech.email}</div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
