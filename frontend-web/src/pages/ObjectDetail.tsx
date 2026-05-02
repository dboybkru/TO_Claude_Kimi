import { useParams, useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { objectsApi, journalsApi, ticketsApi, voiceApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { useState } from 'react'

const TYPE_LABELS: Record<string, string> = { OS:'ОПС', OTS:'ОТС', SKUD:'СКУД', OS_OTS:'ОПС+ОТС', SKUD_OS:'СКУД+ОПС' }
const STATUS_CHIP: Record<string, [string,string]> = {
  active:    ['var(--green-bg)',  'var(--green)'],
  in_repair: ['var(--red-bg)',    'var(--red)'],
  inactive:  ['#141a1a',         '#4d7a9e'],
}
const TICKET_STATUS: Record<string,string> = { new:'Новая', assigned:'Назначена', in_progress:'В работе', resolved:'Решена', closed:'Закрыта', callback_required:'Перезвон' }
const PRIO_COLOR: Record<string,string> = { critical:'var(--red)', high:'var(--orange)', normal:'#62b8f5', low:'var(--green)' }

export default function ObjectDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const access   = getAccess(useAuthStore(s => s.user?.role))
  const [report, setReport]         = useState('')
  const [reporting, setReporting]   = useState(false)
  const [predictive, setPredictive] = useState<{risk_level:string;reason:string;recommended_action:string;days_until_critical?:number}|null>(null)
  const [predLoading, setPredLoading] = useState(false)

  const { data: obj, loading } = useApi(() => objectsApi.get(id!), [id])
  const { data: journalsData } = useApi(() => journalsApi.list({ object_id: id, size: 10 }), [id])
  const { data: ticketsData  } = useApi(() => ticketsApi.list({ object_id: id, size: 10 }), [id])

  const { mutate: changeStatus } = useMutation(
    (status: string) => objectsApi.update(id!, { status: status as 'active'|'inactive'|'in_repair' })
  )

  async function generateReport() {
    setReporting(true)
    try { const r = await voiceApi.objectReport(id!); setReport(r.report) }
    finally { setReporting(false) }
  }

  async function checkPredictive() {
    setPredLoading(true)
    try { const r = await voiceApi.predictive(id!); if(r) setPredictive(r) }
    finally { setPredLoading(false) }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-4)', textAlign:'center' }}>Загрузка…</div>
  if (!obj) return <div style={{ padding: 40, color: 'var(--red)', textAlign:'center' }}>Объект не найден</div>

  const [sbg, sc] = STATUS_CHIP[obj.status] ?? STATUS_CHIP.inactive
  const journals  = journalsData?.items ?? []
  const tickets   = ticketsData?.items ?? []
  const openTickets = tickets.filter(t => !['resolved','closed'].includes(t.status))

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize:12, color:'var(--text-4)', display:'flex', alignItems:'center', gap:6 }}>
        <span onClick={() => navigate('/objects')} style={{ color:'#4d7a9e', cursor:'pointer' }}>Объекты</span>
        <span style={{ color:'#2a4460' }}>›</span>
        <span style={{ color:'var(--text-1)' }}>{obj.name}</span>
      </div>

      {/* Header */}
      <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:'20px 24px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:11, color:'var(--text-4)', fontFamily:'monospace', marginBottom:4 }}>
              {TYPE_LABELS[obj.type]} · {obj.region}
            </div>
            <div style={{ fontSize:22, fontWeight:700, color:'#e8f1fa', marginBottom:10 }}>{obj.name}</div>
            <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:10 }}>📍 {obj.address}</div>
            <span style={{ background:sbg, color:sc, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:4 }}>
              {{ active:'В норме', in_repair:'В ремонте', inactive:'Неактивен' }[obj.status]}
            </span>
            {obj.contract_number && <span style={{ marginLeft:8, fontSize:11, color:'var(--text-3)' }}>Договор: {obj.contract_number}</span>}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {access.canCreateJournal && (
              <button onClick={() => navigate('/journals', { state:{ createJournalForObject: id } })}
                style={{ padding:'8px 16px', borderRadius:8, background:'var(--blue)', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                📋 Создать журнал ТО
              </button>
            )}
            {access.canCreateTicket && (
              <button onClick={() => navigate('/tickets', { state:{ createTicketForObject: id } })}
                style={{ padding:'8px 16px', borderRadius:8, background:'transparent', color:'#62b8f5', border:'1px solid #1a7dbd44', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                🔧 Создать заявку
              </button>
            )}
            {access.canEditObject && (
              <select onChange={e => changeStatus(e.target.value)} value={obj.status}
                style={{ padding:'8px 12px', borderRadius:8, background:'var(--bg-input)', border:'1px solid var(--border-mid)', color:'var(--text-2)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                <option value="active">В норме</option>
                <option value="in_repair">В ремонте</option>
                <option value="inactive">Неактивен</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Открытых заявок', value: openTickets.length, color: openTickets.length ? 'var(--orange)' : 'var(--green)' },
          { label:'Журналов ТО',     value: journals.length, color:'var(--blue)' },
          { label:'Последнее ТО',    value: obj.last_maintenance_at ? new Date(obj.last_maintenance_at).toLocaleDateString('ru-RU') : 'Не было', color:'var(--text-1)' },
          { label:'Ежемес. ТО',      value: obj.monthly_maintenance_required ? 'Да' : 'Нет', color: obj.monthly_maintenance_required ? 'var(--green)' : 'var(--text-4)' },
        ].map(card => (
          <div key={card.label} style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{card.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Recent tickets */}
        <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>Заявки</span>
            <span onClick={() => navigate('/tickets')} style={{ fontSize:11, color:'var(--blue)', cursor:'pointer' }}>Все →</span>
          </div>
          <div>
            {tickets.length === 0 && <div style={{ padding:24, textAlign:'center', color:'var(--text-4)', fontSize:12 }}>Нет заявок</div>}
            {tickets.slice(0,5).map(t => (
              <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                style={{ padding:'10px 16px', borderBottom:'1px solid var(--border-inner)', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:'var(--text-1)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize:10, color:'var(--text-4)', fontFamily:'monospace' }}>{t.ticket_number}</div>
                </div>
                <span style={{ fontSize:10, color:PRIO_COLOR[t.priority], fontWeight:700, flexShrink:0 }}>{t.priority.toUpperCase()}</span>
                <span style={{ fontSize:10, color:'var(--text-4)', flexShrink:0 }}>{TICKET_STATUS[t.status]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent journals */}
        <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>Журналы ТО</span>
            <span onClick={() => navigate('/journals')} style={{ fontSize:11, color:'var(--blue)', cursor:'pointer' }}>Все →</span>
          </div>
          <div>
            {journals.length === 0 && <div style={{ padding:24, textAlign:'center', color:'var(--text-4)', fontSize:12 }}>Нет журналов</div>}
            {journals.slice(0,5).map(j => (
              <div key={j.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border-inner)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'var(--text-1)', fontWeight:500 }}>
                    Журнал #{j.journal_number ?? '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-4)' }}>
                    {j.arrived_at ? new Date(j.arrived_at).toLocaleDateString('ru-RU') : '—'}
                  </div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                  background: j.system_status==='operational' ? 'var(--green-bg)' : j.system_status==='needs_repair' ? 'var(--red-bg)' : '#0d2040',
                  color: j.system_status==='operational' ? 'var(--green)' : j.system_status==='needs_repair' ? 'var(--red)' : '#62b8f5' }}>
                  {j.system_status ? { operational:'Норма', repaired:'Отремонт.', needs_repair:'Ремонт' }[j.system_status] ?? j.system_status : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      {obj.notes && (
        <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16, fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>Примечания</div>
          {obj.notes}
        </div>
      )}

      {/* Predictive Maintenance */}
      <div style={{ background:'var(--bg-panel)', border:`1px solid ${predictive ? ({critical:'var(--red)',high:'var(--orange)',medium:'#d97706',low:'#1a3a5c',unknown:'var(--border)'}[predictive.risk_level] || 'var(--border)') : 'var(--border)'}`, borderRadius:10, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: predictive ? 10 : 0 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>🔮 Предиктивное ТО</div>
            {!predictive && <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>AI оценит риск отказа в ближайший месяц</div>}
          </div>
          <button disabled={predLoading} onClick={checkPredictive}
            style={{ padding:'6px 14px', borderRadius:7, background:predLoading ? '#1a2e42' : '#0a1f30', color:predLoading ? 'var(--text-4)' : '#62b8f5', border:'1px solid #1a3a5c', fontSize:12, fontWeight:600, cursor:predLoading ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
            {predLoading ? 'Анализирую…' : predictive ? '↻ Обновить' : 'Оценить риск'}
          </button>
        </div>
        {predictive && (() => {
          const colors: Record<string,[string,string,string]> = {
            critical: ['var(--red-bg)','var(--red)','🔴 КРИТИЧНЫЙ'],
            high:     ['var(--orange-bg)','var(--orange)','🟠 ВЫСОКИЙ'],
            medium:   ['#2d1a00','#f0a830','🟡 СРЕДНИЙ'],
            low:      ['var(--green-bg)','var(--green)','🟢 НИЗКИЙ'],
            unknown:  ['#1a1a1a','#4d7a9e','⚪ НЕТ ДАННЫХ'],
          }
          const [bg, clr, lbl] = colors[predictive.risk_level] ?? colors.unknown
          return (
            <div>
              <span style={{ background:bg, color:clr, fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:4 }}>{lbl}</span>
              <div style={{ marginTop:8, fontSize:12.5, color:'var(--text-2)', lineHeight:1.6 }}>{predictive.reason}</div>
              {predictive.recommended_action && (
                <div style={{ marginTop:8, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', fontSize:12, color:'var(--text-2)' }}>
                  <strong style={{ color:'var(--text-1)' }}>Рекомендация:</strong> {predictive.recommended_action}
                </div>
              )}
              {predictive.days_until_critical && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--orange)' }}>⏱ До критического состояния: ~{predictive.days_until_critical} дн.</div>
              )}
            </div>
          )
        })()}
      </div>

      {/* AI Report */}
      <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: report ? 12 : 0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)' }}>🤖 AI Отчёт по объекту</div>
          <button disabled={reporting} onClick={generateReport}
            style={{ padding:'6px 14px', borderRadius:7, background:reporting ? '#1a2e42' : '#1a0a3a', color:reporting ? 'var(--text-4)' : 'var(--purple)', border:'1px solid #3a1a6a', fontSize:12, fontWeight:600, cursor:reporting ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
            {reporting ? 'Генерирую…' : report ? '↻ Обновить' : 'Сгенерировать'}
          </button>
        </div>
        {report && (
          <div style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.7, whiteSpace:'pre-line', paddingTop:4 }}>{report}</div>
        )}
      </div>
    </div>
  )
}
