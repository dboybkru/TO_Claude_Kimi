import { useParams, useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { objectsApi, journalsApi, ticketsApi, voiceApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { useState } from 'react'

const TYPE_LABELS: Record<string, string> = { OS:'ОПС', OTS:'ОТС', SKUD:'СКУД', OS_OTS:'ОПС+ОТС', SKUD_OS:'СКУД+ОПС' }
const STATUS_LABELS: Record<string, string> = { active: 'В норме', in_repair: 'В ремонте', inactive: 'Неактивен' }
const STATUS_CLS: Record<string, string> = {
  active: 'md3-status-chip--success',
  in_repair: 'md3-status-chip--critical',
  inactive: 'md3-status-chip--neutral',
}
const TICKET_STATUS: Record<string,string> = { new:'Новая', assigned:'Назначена', in_progress:'В работе', resolved:'Решена', closed:'Закрыта', callback_required:'Перезвон' }
const PRIO_CLS: Record<string,string> = {
  critical: 'md3-status-chip--critical',
  high:     'md3-status-chip--high',
  normal:   'md3-status-chip--normal',
  low:      'md3-status-chip--success',
}

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

  if (loading) return <div style={{ padding: 40, color: 'var(--md-sys-color-on-surface-variant)', textAlign:'center' }}>Загрузка…</div>
  if (!obj) return <div style={{ padding: 40, color: 'var(--md-sys-color-error)', textAlign:'center' }}>Объект не найден</div>

  const journals  = journalsData?.items ?? []
  const tickets   = ticketsData?.items ?? []
  const openTickets = tickets.filter(t => !['resolved','closed'].includes(t.status))

  return (
    <div className="md3-page">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumbs" style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        <span onClick={() => navigate('/objects')} style={{ cursor: 'pointer' }}>Объекты</span>
        <span style={{ margin: '0 8px', color: 'var(--md-sys-color-outline)' }}>›</span>
        <span style={{ color: 'var(--md-sys-color-on-surface)', fontWeight: 500 }}>{obj.name}</span>
      </nav>

      {/* Header */}
      <div className="md3-card" style={{ padding: '22px 24px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)', fontFamily:'ui-monospace, monospace', marginBottom:6 }}>
              {TYPE_LABELS[obj.type]} · {obj.region}
            </div>
            <div style={{ fontSize:24, fontWeight:600, color:'var(--md-sys-color-on-surface)', lineHeight:'32px', marginBottom:10 }}>{obj.name}</div>
            <div style={{ fontSize:13.5, color:'var(--md-sys-color-on-surface-variant)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:'Material Symbols Rounded', fontSize:18 }}>location_on</span>
              {obj.address}
            </div>
            <span className={`md3-status-chip ${STATUS_CLS[obj.status] ?? STATUS_CLS.inactive}`}>
              <span className="md3-status-chip__dot" />
              {STATUS_LABELS[obj.status]}
            </span>
            {obj.contract_number && (
              <span style={{ marginLeft:10, fontSize:12, color:'var(--md-sys-color-on-surface-variant)' }}>
                Договор: {obj.contract_number}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {access.canCreateJournal && (
              <button onClick={() => navigate('/journals', { state:{ createJournalForObject: id } })} className="md3-btn-tonal">
                <span className="ic" aria-hidden>description</span>
                Создать журнал ТО
              </button>
            )}
            {access.canCreateTicket && (
              <button onClick={() => navigate('/tickets', { state:{ createTicketForObject: id } })} className="md3-btn-outlined" style={{ height:40, width:'auto', padding:'0 18px' }}>
                <span className="ic" aria-hidden>build</span>
                Создать заявку
              </button>
            )}
            {access.canEditObject && (
              <select onChange={e => changeStatus(e.target.value)} value={obj.status}
                style={{ padding:'10px 14px', borderRadius:'var(--md-sys-shape-corner-extra-small)', background:'var(--md-sys-color-surface-container)', border:'1px solid var(--md-sys-color-outline)', color:'var(--md-sys-color-on-surface)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                <option value="active">В норме</option>
                <option value="in_repair">В ремонте</option>
                <option value="inactive">Неактивен</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {[
          { label:'Открытых заявок', value: openTickets.length, color: openTickets.length ? '#F0A830' : '#52C97E' },
          { label:'Журналов ТО',     value: journals.length, color:'var(--md-sys-color-primary)' },
          { label:'Последнее ТО',    value: obj.last_maintenance_at ? new Date(obj.last_maintenance_at).toLocaleDateString('ru-RU') : 'Не было', color:'var(--md-sys-color-on-surface)' },
          { label:'Ежемес. ТО',      value: obj.monthly_maintenance_required ? 'Да' : 'Нет', color: obj.monthly_maintenance_required ? '#52C97E' : 'var(--md-sys-color-on-surface-variant)' },
        ].map(card => (
          <div key={card.label} className="md3-card" style={{ padding:'16px 18px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{card.label}</div>
            <div style={{ fontSize:22, fontWeight:600, color:card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Recent tickets */}
        <div className="md3-card" style={{ display:'flex', flexDirection:'column' }}>
          <div className="md3-card__header">
            <div className="md3-card__title">Заявки</div>
            <span className="md3-card__action" onClick={() => navigate('/tickets')}>Все →</span>
          </div>
          <div>
            {tickets.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--md-sys-color-on-surface-variant)', fontSize:13 }}>Нет заявок</div>}
            {tickets.slice(0,5).map(t => (
              <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                style={{ padding:'12px 18px', borderBottom:'1px solid var(--md-sys-color-outline-variant)', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'var(--md-sys-color-on-surface)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize:11, color:'var(--md-sys-color-on-surface-variant)', fontFamily:'ui-monospace, monospace', marginTop:2 }}>{t.ticket_number}</div>
                </div>
                <span className={`md3-status-chip ${PRIO_CLS[t.priority] ?? PRIO_CLS.normal}`}>{t.priority.toUpperCase()}</span>
                <span style={{ fontSize:11, color:'var(--md-sys-color-on-surface-variant)', flexShrink:0 }}>{TICKET_STATUS[t.status]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent journals */}
        <div className="md3-card" style={{ display:'flex', flexDirection:'column' }}>
          <div className="md3-card__header">
            <div className="md3-card__title">Журналы ТО</div>
            <span className="md3-card__action" onClick={() => navigate('/journals')}>Все →</span>
          </div>
          <div>
            {journals.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--md-sys-color-on-surface-variant)', fontSize:13 }}>Нет журналов</div>}
            {journals.slice(0,5).map(j => {
              const sysCls = j.system_status === 'operational' ? 'md3-status-chip--success'
                           : j.system_status === 'needs_repair' ? 'md3-status-chip--critical'
                           : 'md3-status-chip--normal'
              return (
                <div key={j.id} style={{ padding:'12px 18px', borderBottom:'1px solid var(--md-sys-color-outline-variant)', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:'var(--md-sys-color-on-surface)', fontWeight:500 }}>
                      Журнал #{j.journal_number ?? '—'}
                    </div>
                    <div style={{ fontSize:11, color:'var(--md-sys-color-on-surface-variant)', marginTop:2 }}>
                      {j.arrived_at ? new Date(j.arrived_at).toLocaleDateString('ru-RU') : '—'}
                    </div>
                  </div>
                  <span className={`md3-status-chip ${sysCls}`}>
                    {j.system_status ? { operational:'Норма', repaired:'Отремонт.', needs_repair:'Ремонт' }[j.system_status] ?? j.system_status : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Notes */}
      {obj.notes && (
        <div className="md3-card" style={{ padding:18, fontSize:13.5, color:'var(--md-sys-color-on-surface-variant)', lineHeight:1.6 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--md-sys-color-on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Примечания</div>
          {obj.notes}
        </div>
      )}

      {/* Predictive Maintenance */}
      <div className="md3-card" style={{ padding:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: predictive ? 12 : 0, gap:14 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--md-sys-color-on-surface)', display:'inline-flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:'Material Symbols Rounded', fontSize:20 }}>insights</span>
              Предиктивное ТО
            </div>
            {!predictive && <div style={{ fontSize:12, color:'var(--md-sys-color-on-surface-variant)', marginTop:4 }}>AI оценит риск отказа в ближайший месяц</div>}
          </div>
          <button disabled={predLoading} onClick={checkPredictive} className="md3-btn-tonal">
            <span className="ic" aria-hidden>{predLoading ? 'hourglass' : 'auto_awesome'}</span>
            {predLoading ? 'Анализирую…' : predictive ? 'Обновить' : 'Оценить риск'}
          </button>
        </div>
        {predictive && (() => {
          const map: Record<string, [string, string]> = {
            critical: ['md3-status-chip--critical', '🔴 КРИТИЧНЫЙ'],
            high:     ['md3-status-chip--high',     '🟠 ВЫСОКИЙ'],
            medium:   ['md3-status-chip--high',     '🟡 СРЕДНИЙ'],
            low:      ['md3-status-chip--success',  '🟢 НИЗКИЙ'],
            unknown:  ['md3-status-chip--neutral',  '⚪ НЕТ ДАННЫХ'],
          }
          const [cls, lbl] = map[predictive.risk_level] ?? map.unknown
          return (
            <div>
              <span className={`md3-status-chip ${cls}`}>{lbl}</span>
              <div style={{ marginTop:10, fontSize:13.5, color:'var(--md-sys-color-on-surface-variant)', lineHeight:1.6 }}>{predictive.reason}</div>
              {predictive.recommended_action && (
                <div style={{ marginTop:10, background:'var(--md-sys-color-surface-container-low)', borderRadius:'var(--md-sys-shape-corner-small)', padding:'10px 14px', fontSize:13, color:'var(--md-sys-color-on-surface-variant)' }}>
                  <strong style={{ color:'var(--md-sys-color-on-surface)' }}>Рекомендация:</strong> {predictive.recommended_action}
                </div>
              )}
              {predictive.days_until_critical && (
                <div style={{ marginTop:8, fontSize:12, color:'#F0A830' }}>⏱ До критического состояния: ~{predictive.days_until_critical} дн.</div>
              )}
            </div>
          )
        })()}
      </div>

      {/* AI Report */}
      <div className="md3-card" style={{ padding:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: report ? 14 : 0, gap:14 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--md-sys-color-on-surface)', display:'inline-flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:'Material Symbols Rounded', fontSize:20 }}>smart_toy</span>
            AI Отчёт по объекту
          </div>
          <button disabled={reporting} onClick={generateReport} className="md3-btn-tonal">
            <span className="ic" aria-hidden>{reporting ? 'hourglass' : report ? 'refresh' : 'play_arrow'}</span>
            {reporting ? 'Генерирую…' : report ? 'Обновить' : 'Сгенерировать'}
          </button>
        </div>
        {report && (
          <div style={{ fontSize:13.5, color:'var(--md-sys-color-on-surface-variant)', lineHeight:1.7, whiteSpace:'pre-line', paddingTop:4 }}>{report}</div>
        )}
      </div>
    </div>
  )
}
