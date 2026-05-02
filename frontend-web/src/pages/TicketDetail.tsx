import { useParams, useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { ticketsApi, usersApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { useState } from 'react'
import { inputCss, selectCss, textareaCss } from '../components/FormField'

const PRIORITY_META: Record<string,[string,string,string]> = {
  critical: ['var(--red-bg)',    'var(--red)',    'КРИТИЧНО'],
  high:     ['var(--orange-bg)', 'var(--orange)', 'ВЫСОКИЙ'],
  normal:   ['#0d2040',          '#62b8f5',       'СРЕДНИЙ'],
  low:      ['var(--green-bg)',  'var(--green)',   'НИЗКИЙ'],
}
const STATUS_META: Record<string,[string,string,string]> = {
  new:               ['#1a0f30','#c490f0','Новая'],
  callback_required: ['#2d1a00','#f0a830','Перезвон'],
  assigned:          ['#0d2040','#62b8f5','Назначена'],
  in_progress:       ['#0a2030','#3aaa8a','В работе'],
  resolved:          ['#0a2518','#52c97e','Решена'],
  closed:            ['#141a1a','#3d5a72','Закрыта'],
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

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Загрузка…</div>
  if (!ticket) return <div style={{ padding:40, textAlign:'center', color:'var(--red)' }}>Тикет не найден</div>

  const isClosed = ['resolved','closed'].includes(ticket.status)
  const [pbg, pc, pl] = PRIORITY_META[ticket.priority] ?? PRIORITY_META.normal
  const [sbg, sc, sl] = STATUS_META[ticket.status]    ?? STATUS_META.new
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
    <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize:12, color:'var(--text-4)', display:'flex', alignItems:'center', gap:6 }}>
        <span onClick={() => navigate('/tickets')} style={{ color:'#4d7a9e', cursor:'pointer' }}>Заявки</span>
        <span style={{ color:'#2a4460' }}>›</span>
        <span style={{ color:'var(--text-1)', fontFamily:'monospace' }}>{ticket.ticket_number}</span>
      </div>

      {/* Header */}
      <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:'20px 24px' }}>
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          <span style={{ background:pbg, color:pc, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:4 }}>{pl}</span>
          <span style={{ background:sbg, color:sc, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:4 }}>{sl}</span>
          <span style={{ fontSize:11, color:'var(--text-3)', padding:'3px 0' }}>{SOURCE_LABEL[ticket.source]}</span>
          {ticket.fault_type && <span style={{ fontSize:11, color:'var(--text-4)' }}>· {FAULT_LABEL[ticket.fault_type]}</span>}
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:'#e8f1fa', marginBottom:8 }}>{ticket.title}</div>
        {ticket.description && (
          <div style={{ fontSize:13, color:'var(--text-2)', background:'var(--bg-card)', padding:'10px 14px', borderRadius:8, lineHeight:1.6 }}>
            {ticket.description}
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
        {/* Left: details */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Info card */}
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Сведения</div>
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
              <div key={String(l)} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border-inner)' }}>
                <span style={{ fontSize:11, color:'var(--text-3)' }}>{l}</span>
                <span style={{ fontSize:12, color:'#b0cde0', fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Resolution notes */}
          {ticket.resolution_notes && (
            <div style={{ background:'var(--green-bg)', border:'1px solid #1a4030', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>Решение</div>
              <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{ticket.resolution_notes}</div>
            </div>
          )}

          {/* Audio recording */}
          {ticket.call_recording_url && (
            <a href={ticket.call_recording_url} target="_blank" rel="noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:8, background:'var(--bg-panel)', border:'1px solid var(--border)', color:'#62b8f5', textDecoration:'none', fontSize:13 }}>
              🎙 Прослушать запись звонка
            </a>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Resolve */}
          {!isClosed && (access.canResolveTicket || ticket.assigned_to_id === user?.id) && (
            <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Закрытие заявки</div>
              {!showResolve ? (
                <button onClick={() => setShowResolve(true)}
                  style={{ width:'100%', padding:10, borderRadius:8, background:'var(--green-bg)', color:'var(--green)', border:'1px solid #1a4030', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  ✓ Закрыть заявку
                </button>
              ) : (
                <>
                  <textarea style={{ ...textareaCss, marginBottom:8 }} value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="Описание выполненных работ…" />
                  <button disabled={!resolveNotes.trim() || resolving} onClick={handleResolve}
                    style={{ width:'100%', padding:10, borderRadius:8, background:!resolveNotes.trim() || resolving ? '#1a2e42' : 'var(--green-bg)', color:!resolveNotes.trim() || resolving ? 'var(--text-4)' : 'var(--green)', border:'1px solid #1a4030', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                    {resolving ? 'Сохранение…' : '✓ Подтвердить'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Audio Player + Transcript */}
          {ticket.call_recording_url && (
            <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Запись звонка</div>
              <audio controls style={{ width:'100%', marginBottom:12 }} src={ticket.call_recording_url} />
              {ticket.source === 'voice_bot' && (
                <div style={{ fontSize:11, color:'var(--text-3)', display:'flex', alignItems:'center', gap:6 }}>
                  <span>🤖</span>
                  <span>Источник: Голосовой робот</span>
                </div>
              )}
              {/* Transcript placeholder - will be fetched from API */}
              <div style={{ marginTop:12, padding:10, background:'var(--bg-card)', borderRadius:8, border:'1px solid var(--border-inner)' }}>
                <div style={{ fontSize:10, fontWeight:600, color:'var(--text-4)', marginBottom:6 }}>AI Транскрипция</div>
                <div style={{ fontSize:12, color:'var(--text-2)', fontStyle:'italic' }}>
                  Транскрипция будет доступна после обработки аудио...
                </div>
              </div>
            </div>
          )}

          {/* Assign */}
          {!isClosed && access.canAssignTicket && techs.length > 0 && (
            <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Назначить монтажника</div>
              <select value={assignTechId} onChange={e => setAssignTechId(e.target.value)} style={{ ...selectCss, marginBottom:8 }}>
                <option value="" style={{ background:'#0d1d2c' }}>— Выбрать —</option>
                {techs.map(t => <option key={t.id} value={t.id} style={{ background:'#0d1d2c' }}>{t.full_name}</option>)}
              </select>
              <button disabled={!assignTechId || assigning} onClick={handleAssign}
                style={{ width:'100%', padding:10, borderRadius:8, background:!assignTechId || assigning ? '#1a2e42' : 'var(--blue)', color:!assignTechId || assigning ? 'var(--text-4)' : '#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
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
              <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Исполнитель</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'#1a5c8a44', color:'#62b8f5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, border:'1px solid #1a5c8a33' }}>{inits}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>{tech.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--text-3)' }}>{tech.phone ?? tech.email}</div>
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
