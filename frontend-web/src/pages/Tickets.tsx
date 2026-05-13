import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { ticketsApi, objectsApi, usersApi, voiceApi } from '../api/services'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import type { RepairTicket, RepairTicketCreate, ObjectItem, User } from '../api/types'
import Modal from '../components/Modal'
import { FormField, inputCss, selectCss, textareaCss } from '../components/FormField'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY_META: Record<string, [string, string, string]> = {
  critical: ['#3a0f0f', '#e85d4a', 'КРИТИЧНО'],
  high:     ['#2d1a00', '#f0a830', 'ВЫСОКИЙ'],
  normal:   ['#0d2040', '#62b8f5', 'СРЕДНИЙ'],
  medium:   ['#0d2040', '#62b8f5', 'СРЕДНИЙ'],
  low:      ['#0a1a10', '#3aaa70', 'НИЗКИЙ'],
}
const SOURCE_META: Record<string, [string, string, string]> = {
  voice_bot:    ['#1a0a3a', '#9b72ef', '🤖 Робот'],
  manual:       ['#0a2030', '#4d8aba', '🤚 Вручную'],
  journal_auto: ['#0a2518', '#3aaa70', '⚡ Авто'],
}
const STATUS_META: Record<string, [string, string, string]> = {
  new:               ['#1a0f30', '#c490f0', 'Новая'],
  callback_required: ['#2d1a00', '#f0a830', 'Перезвон'],
  assigned:          ['#0d2040', '#62b8f5', 'Назначена'],
  in_progress:       ['#0a2030', '#3aaa8a', 'В работе'],
  resolved:          ['#0a2518', '#52c97e', 'Решена'],
  closed:            ['#141a1a', '#3d5a72', 'Закрыта'],
}

function PrioBadge({ p }: { p: string }) {
  const cls = p === 'critical' ? 'md3-status-chip--critical'
            : p === 'high'     ? 'md3-status-chip--high'
            : p === 'low'      ? 'md3-status-chip--success'
            : 'md3-status-chip--normal'
  const [, , label] = PRIORITY_META[p] ?? PRIORITY_META.normal
  return <span className={`md3-status-chip ${cls}`}>{label}</span>
}
function SourceBadge({ s }: { s: string }) {
  const [, , label] = SOURCE_META[s] ?? SOURCE_META.manual
  return <span className="md3-status-chip md3-status-chip--neutral">{label}</span>
}
function StatusBadge({ s }: { s: string }) {
  const cls = s === 'resolved' || s === 'closed' ? 'md3-status-chip--success'
            : s === 'callback_required'         ? 'md3-status-chip--high'
            : 'md3-status-chip--normal'
  const [, , label] = STATUS_META[s] ?? STATUS_META.new
  return <span className={`md3-status-chip ${cls}`}>{label}</span>
}

function timeAgo(iso?: string) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m} мин назад`
  if (m < 1440) return `${Math.floor(m / 60)} ч назад`
  return `${Math.floor(m / 1440)} дн. назад`
}

// ── Create Ticket Form ────────────────────────────────────────────────────────
const PRIORITY_LABELS: Record<string, string> = { critical: 'Критичный', high: 'Высокий', normal: 'Средний', low: 'Низкий' }
const FAULT_LABELS: Record<string, string>    = { hardware: 'Оборудование', software: 'ПО', power: 'Питание', sensor: 'Датчики', access: 'Доступ', other: 'Прочее' }

function CreateTicketModal({ open, onClose, onCreated, objects, initialObjectId }: {
  open: boolean; onClose: () => void; onCreated: () => void; objects: ObjectItem[]; initialObjectId?: string
}) {
  const [form, setForm] = useState<Partial<RepairTicketCreate>>({ priority: 'normal', source: 'manual', fault_type: 'other', object_id: initialObjectId })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hint, setHint] = useState<{ priority?: string; fault_type?: string; title?: string } | null>(null)
  const [hinting, setHinting] = useState(false)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (open) setForm(p => ({ ...p, object_id: initialObjectId ?? p.object_id })) }, [open, initialObjectId])
  const { mutate, loading, error } = useMutation((d: RepairTicketCreate) => ticketsApi.create(d))

  function f(k: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value })) }

  // Debounced AI hint when user types description
  function onDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setForm(p => ({ ...p, description: val }))
    if (hintTimer.current) clearTimeout(hintTimer.current)
    if (val.trim().length >= 15) {
      hintTimer.current = setTimeout(async () => {
        setHinting(true)
        try {
          const h = await voiceApi.ticketHint(val)
          if (h && Object.keys(h).length) setHint(h)
        } finally { setHinting(false) }
      }, 900)
    } else {
      setHint(null)
    }
  }

  function applyHint() {
    if (!hint) return
    setForm(p => ({
      ...p,
      priority:   (hint.priority   as RepairTicketCreate['priority']) ?? p.priority,
      fault_type: (hint.fault_type as RepairTicketCreate['fault_type']) ?? p.fault_type,
      title:      hint.title ?? p.title,
    }))
    setHint(null)
  }

  async function submit() {
    const e: Record<string, string> = {}
    if (!form.title?.trim()) e.title = 'Обязательное поле'
    setErrors(e)
    if (Object.keys(e).length) return
    const result = await mutate(form as RepairTicketCreate)
    if (result) { setForm({ priority: 'normal', source: 'manual', fault_type: 'other' }); setHint(null); onCreated(); onClose() }
  }

  return (
    <Modal open={open} title="Новая заявка" onClose={onClose} onConfirm={submit} confirmLoading={loading} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}

        {/* AI hint banner */}
        {hint && (
          <div style={{ background: '#0a1a30', border: '1px solid #1a3a5c', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ color: '#62b8f5', fontWeight: 600, marginBottom: 4 }}>AI предлагает:</div>
              <div style={{ color: 'var(--text-2)' }}>
                {hint.title && <span>«{hint.title}» · </span>}
                {hint.priority && <span>{PRIORITY_LABELS[hint.priority]} · </span>}
                {hint.fault_type && <span>{FAULT_LABELS[hint.fault_type]}</span>}
              </div>
            </div>
            <button onClick={applyHint} style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Применить</button>
            <button onClick={() => setHint(null)} style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', color: 'var(--text-4)', border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
          </div>
        )}

        <FormField label="Подробное описание">
          <div style={{ position: 'relative' }}>
            <textarea style={{ ...textareaCss, paddingRight: hinting ? 32 : undefined }}
              value={form.description ?? ''} onChange={onDescriptionChange}
              placeholder="Опишите проблему — AI автоматически предложит приоритет и тип…" />
            {hinting && <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 14, animation: 'spin 1s linear infinite' }}>⏳</span>}
          </div>
        </FormField>

        <FormField label="Заголовок заявки" required error={errors.title}>
          <input style={inputCss} value={form.title ?? ''} onChange={f('title')} placeholder="Краткое описание (заполнится автоматически из AI)" />
        </FormField>

        <FormField label="Объект">
          <select style={selectCss} value={form.object_id ?? ''} onChange={f('object_id')}>
            <option value="" style={{ background: '#0d1d2c' }}>— Не выбран —</option>
            {objects.map(o => <option key={o.id} value={o.id} style={{ background: '#0d1d2c' }}>{o.name} ({o.address?.split(',')[0]})</option>)}
          </select>
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Приоритет">
            <select style={selectCss} value={form.priority} onChange={f('priority')}>
              {Object.entries(PRIORITY_LABELS).map(([v,l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Тип неисправности">
            <select style={selectCss} value={form.fault_type} onChange={f('fault_type')}>
              {Object.entries(FAULT_LABELS).map(([v,l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
        </div>
      </div>
    </Modal>
  )
}

// ── Ticket Card ───────────────────────────────────────────────────────────────
function TicketCard({ t, selected, onSelect, onOpen }: { t: RepairTicket; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  return (
    <div onClick={onSelect} style={{ padding: '11px 13px', borderBottom: '1px solid var(--border-inner)', cursor: 'pointer', background: selected ? '#0c2035' : 'transparent', transition: 'background 0.12s', position: 'relative' }}>
      {selected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--blue)', borderRadius: '0 2px 2px 0' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>{t.ticket_number}</span>
        <SourceBadge s={t.source} />
        <PrioBadge p={t.priority} />
        <button onClick={e => { e.stopPropagation(); onOpen() }}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-4)', fontSize: 10, cursor: 'pointer', padding: '1px 4px', borderRadius: 4 }}
          title="Открыть страницу">↗</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>{t.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔧 {t.fault_type ?? '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusBadge s={t.status} />
        <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 'auto' }}>{timeAgo(t.created_at)}</span>
      </div>
    </div>
  )
}

// ── Ticket Detail ─────────────────────────────────────────────────────────────
function TicketDetail({ ticket, technicians, onAssigned, onResolved, access }: {
  ticket: RepairTicket | null
  technicians: User[]
  onAssigned: () => void
  onResolved: () => void
  access: ReturnType<typeof getAccess>
}) {
  const [selTech, setSelTech] = useState('')
  const [resolveNotes, setResolveNotes] = useState('')
  const [showResolve, setShowResolve] = useState(false)
  const [similar, setSimilar]           = useState<string | null>(null)
  const [similarLoading, setSimilarLoading] = useState(false)
  const [aiTechSuggest, setAiTechSuggest] = useState<{technician_id?:string;technician_name?:string;reason?:string} | null>(null)
  const [techSugLoading, setTechSugLoading] = useState(false)
  const { mutate: assign, loading: assigning } = useMutation(({ id, tid }: { id: string; tid: string }) => ticketsApi.assign(id, tid))
  const { mutate: resolve, loading: resolving } = useMutation(({ id, notes }: { id: string; notes: string }) => ticketsApi.resolve(id, notes))

  async function loadSimilar() {
    if (!ticket) return
    setSimilarLoading(true)
    try {
      const r = await voiceApi.similarTickets(ticket.title, ticket.description || '', ticket.fault_type || undefined)
      setSimilar(r.similar || 'Похожих случаев не найдено.')
    } finally { setSimilarLoading(false) }
  }

  async function suggestTech() {
    if (!ticket) return
    setTechSugLoading(true)
    try {
      const r = await voiceApi.suggestTechnician(ticket.title, ticket.fault_type || undefined, ticket.object_id || undefined)
      setAiTechSuggest(r)
      if (r.technician_id) setSelTech(r.technician_id)
    } finally { setTechSugLoading(false) }
  }

  useEffect(() => { setSelTech(ticket?.assigned_to_id ?? ''); setShowResolve(false) }, [ticket?.id])

  if (!ticket) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
      <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 56, opacity: 0.3 }}>build</span>
      <div style={{ fontSize: 14 }}>Выберите заявку</div>
    </div>
  )

  const tech = selTech ? technicians.find(u => u.id === selTech) : null
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-4)', marginBottom: 3 }}>{ticket.ticket_number}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8f1fa', lineHeight: 1.3 }}>{ticket.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 6 }}>
            <PrioBadge p={ticket.priority} /><StatusBadge s={ticket.status} /><SourceBadge s={ticket.source} />
          </div>
        </div>
        {!isClosed && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowResolve(true)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid #1a4030' }}>✓ Закрыть</button>
            <button style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: '#1a2e42', color: '#7ab5d8', border: '1px solid #1a3a5c' }}>📞 Перезвонить</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Info */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-inner)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Сведения</div>
          {([
            ['Тип неисправности', ticket.fault_type ?? '—'],
            ['Источник', ticket.source === 'voice_bot' ? '🤖 Голосовой робот' : ticket.source === 'journal_auto' ? '⚡ Из журнала ТО' : '🤚 Вручную'],
            ['Создана', new Date(ticket.created_at).toLocaleString('ru-RU')],
            ticket.assigned_at ? ['Назначена', new Date(ticket.assigned_at).toLocaleString('ru-RU')] : null,
            ticket.resolved_at ? ['Закрыта', new Date(ticket.resolved_at).toLocaleString('ru-RU')] : null,
          ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #0d1e2e', gap: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{l}</span>
              <span style={{ fontSize: 12, color: '#b0cde0', fontWeight: 500, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          {ticket.description && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 6 }}>{ticket.description}</div>
          )}
        </div>

        {/* Resolve form */}
        {showResolve && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-inner)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Закрытие заявки</div>
            <textarea style={{ ...textareaCss, marginBottom: 8 }} placeholder="Описание выполненных работ…" value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} />
            <button disabled={!resolveNotes.trim() || resolving} onClick={async () => {
              const r = await resolve({ id: ticket.id, notes: resolveNotes })
              if (r) { setShowResolve(false); onResolved() }
            }} style={{ width: '100%', padding: 9, borderRadius: 8, background: !resolveNotes.trim() || resolving ? '#1a2e42' : 'var(--green-bg)', color: !resolveNotes.trim() || resolving ? 'var(--text-4)' : 'var(--green)', border: `1px solid ${!resolveNotes.trim() || resolving ? 'transparent' : '#1a4030'}`, fontSize: 13, fontWeight: 600, cursor: !resolveNotes.trim() || resolving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {resolving ? 'Сохранение…' : '✓ Подтвердить закрытие'}
            </button>
          </div>
        )}

        {/* Similar cases */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-inner)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: similar ? 10 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>🔍 Похожие случаи</div>
            <button disabled={similarLoading} onClick={loadSimilar}
              style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-mid)', color: '#62b8f5', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {similarLoading ? '⏳' : similar ? '↻' : 'Найти'}
            </button>
          </div>
          {similar && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-line' }}>
              {similar}
            </div>
          )}
        </div>

        {/* Assign */}
        {!isClosed && access.canAssignTicket && technicians.length > 0 && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-inner)' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Назначить монтажника</div>
                <button disabled={techSugLoading} onClick={suggestTech}
                  style={{ padding: '3px 10px', borderRadius: 5, background: '#0a1f30', border: '1px solid #1a3a5c', color: '#62b8f5', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {techSugLoading ? '⏳' : '🤖 AI выбор'}
                </button>
              </div>
              {aiTechSuggest?.reason && (
                <div style={{ fontSize: 11, color: 'var(--green)', background: 'var(--green-bg)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
                  🤖 {aiTechSuggest.reason}
                </div>
              )}
              <select value={selTech} onChange={e => setSelTech(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-1)', fontSize: 13, padding: '9px 12px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                <option value="" style={{ background: 'var(--bg-panel)' }}>— Выбрать монтажника —</option>
                {technicians.filter(u => u.role === 'TECHNICIAN' && u.is_active).map(u => (
                  <option key={u.id} value={u.id} style={{ background: 'var(--bg-panel)' }}>{u.full_name}</option>
                ))}
              </select>
              {tech && (
                <div style={{ background: '#0b1825', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a5c8a55', color: '#62b8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{tech.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{tech.phone ?? tech.email}</div>
                  </div>
                </div>
              )}
              <button disabled={!selTech || assigning} onClick={async () => {
                const r = await assign({ id: ticket.id, tid: selTech })
                if (r) onAssigned()
              }} style={{ width: '100%', padding: 9, borderRadius: 8, background: !selTech || assigning ? '#1a2e42' : 'var(--blue)', color: !selTech || assigning ? 'var(--text-4)' : '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: !selTech || assigning ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {assigning ? 'Назначение…' : 'Назначить монтажника'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Callbacks Panel ───────────────────────────────────────────────────────────
function CallbacksPanel({ refetchTickets }: { refetchTickets: () => void }) {
  const { data: cbTickets, loading, refetch } = useApi(() => ticketsApi.callbackQueue())
  const [sel, setSel]           = useState<RepairTicket | null>(null)
  const [transcript, setTranscript] = useState('')
  const [aiResult, setAiResult] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const { mutate: resolve }     = useMutation(({ id, notes }: { id: string; notes: string }) => ticketsApi.resolve(id, notes))

  const items = cbTickets ?? []

  function timeAgo(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 60) return `${m} мин назад`
    return `${Math.floor(m / 60)} ч назад`
  }

  async function analyzeWithAi() {
    if (!transcript.trim()) return
    setAiLoading(true); setAiResult('')
    try {
      const res = await voiceApi.analyzeTranscript(transcript, sel?.caller_phone ?? '', false)
      setAiResult(`Приоритет: ${res.priority.toUpperCase()}\n\n${res.summary}`)
    } catch { setAiResult('Ошибка AI анализа') }
    finally { setAiLoading(false) }
  }

  async function handleResolve(notes: string) {
    if (!sel) return
    await resolve({ id: sel.id, notes })
    refetch(); refetchTickets(); setSel(null)
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* List */}
      <div style={{ width: 400, minWidth: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Ожидают перезвона</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>…</span>}
              <span className="chip chip-orange">{items.length} вызовов</span>
              <span onClick={refetch} style={{ fontSize: 11, color: '#4d7a9e', cursor: 'pointer' }}>↻</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Голосовой бот — требуется обратный звонок</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {items.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
              <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 8 }}>📞</div>
              Нет ожидающих вызовов
            </div>
          )}
          {items.map(t => (
            <div key={t.id} onClick={() => { setSel(t); setTranscript(''); setAiResult('') }}
              style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-inner)', cursor: 'pointer', background: sel?.id === t.id ? '#0c2035' : 'transparent', position: 'relative' }}>
              {sel?.id === t.id && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--purple)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 22, height: 22, background: 'var(--purple-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🤖</div>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-4)' }}>{t.ticket_number}</span>
                <StatusBadge s={t.status} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>
                {t.caller_phone ?? 'Неизвестный номер'}
              </div>
              <div style={{ fontSize: 11.5, color: '#5a7a96', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{timeAgo(t.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!sel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#2d4a62' }}>
            <div style={{ fontSize: 40, opacity: 0.2 }}>📞</div>
            <div style={{ fontSize: 13 }}>Выберите вызов для обработки</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#e8f1fa', marginBottom: 4 }}>{sel.caller_phone ?? '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{sel.ticket_number} · {timeAgo(sel.created_at)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{sel.title}</div>
              {sel.description && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 6, lineHeight: 1.5 }}>{sel.description}</div>
              )}
            </div>

            {/* AI Transcript Analysis */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🤖 AI Анализ транскрипта</div>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Вставьте транскрипт звонка или введите описание проблемы…"
                style={{ width: '100%', minHeight: 80, background: '#091624', border: '1px solid #1a2e42', borderRadius: 8, color: '#c5d8ea', fontSize: 12, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <button disabled={!transcript.trim() || aiLoading} onClick={analyzeWithAi}
                style={{ marginTop: 8, padding: '8px 16px', borderRadius: 7, background: !transcript.trim() || aiLoading ? '#1a2e42' : '#1a0a3a', color: !transcript.trim() || aiLoading ? 'var(--text-4)' : 'var(--purple)', border: '1px solid #3a1a6a', fontSize: 12, fontWeight: 600, cursor: !transcript.trim() || aiLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {aiLoading ? '🤖 Анализирую…' : '🤖 Анализировать'}
              </button>
              {aiResult && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', background: '#1a0a3a', border: '1px solid #3a1a6a', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {aiResult}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.open(`tel:${sel.caller_phone}`)}
                style={{ flex: 1, padding: 11, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #1a4030', background: 'var(--green-bg)', color: 'var(--green)', fontFamily: 'inherit' }}>
                📞 Перезвонить
              </button>
              <button onClick={() => handleResolve('Вызов обработан диспетчером')}
                style={{ flex: 1, padding: 11, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #1a3a5c', background: '#0a1f30', color: '#62b8f5', fontFamily: 'inherit' }}>
                ✓ Закрыть вызов
              </button>
            </div>

            {sel.call_recording_url && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🎙 Запись звонка</div>
                <audio controls style={{ width: '100%' }} src={sel.call_recording_url} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Status tabs ───────────────────────────────────────────────────────────────
const STATUS_TABS = [
  { key: 'all',       label: 'Все' },
  { key: 'new',       label: 'Новые' },
  { key: 'assigned',  label: 'Назначены' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'closed',    label: 'Закрыты' },
]

// ── Tickets Page ──────────────────────────────────────────────────────────────
export default function Tickets() {
  const navigate  = useNavigate()
  const access    = getAccess(useAuthStore(s => s.user?.role))
  const location  = useLocation()
  const [pageTab, setPageTab]   = useState<'tickets' | 'callbacks'>('tickets')
  const [statusFilter, setStatus] = useState('all')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<RepairTicket | null>(null)
  const [createOpen, setCreate] = useState(false)
  const [createForObjectId, setCreateForObjectId] = useState<string | undefined>()

  useEffect(() => {
    const state = location.state as { createTicketForObject?: string } | null
    if (state?.createTicketForObject) {
      setCreateForObjectId(state.createTicketForObject)
      setCreate(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const { data: ticketsData, loading, refetch } = useApi(() => ticketsApi.list({ size: 100, status: statusFilter !== 'all' ? statusFilter as RepairTicket['status'] : undefined }), [statusFilter])
  const { data: objectsData }   = useApi(() => objectsApi.list({ size: 200 }))
  const { data: technicians }   = useApi(() => usersApi.list())

  const items = ticketsData?.items ?? []
  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(t => t.title.toLowerCase().includes(q) || t.ticket_number?.toLowerCase().includes(q))
  }, [items, search])

  const openCount = (ticketsData?.total ?? 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar — MD3 sub-header */}
      <div style={{
        height: 56,
        background: 'var(--md-sys-color-surface)',
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14, flexShrink: 0,
      }}>
        <nav aria-label="breadcrumbs" style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>Дашборд</span>
          <span style={{ margin: '0 8px', color: 'var(--md-sys-color-outline)' }}>›</span>
          <span style={{ color: 'var(--md-sys-color-on-surface)', fontWeight: 500 }}>Заявки</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--md-sys-color-error)' }}>
          <div className="pulse-dot" />Онлайн {loading && '…'}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{openCount} заявок</span>
        {access.canCreateTicket && (
          <button className="md3-btn-tonal" onClick={() => setCreate(true)}>
            <span className="ic" aria-hidden>add</span>
            Новая заявка
          </button>
        )}
      </div>

      {/* MD3 Primary Tabs */}
      <div style={{
        background: 'var(--md-sys-color-surface)',
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        display: 'flex', padding: '0 24px', flexShrink: 0,
      }}>
        {[
          { key: 'tickets',   icon: 'build',     label: 'Заявки',    count: openCount, red: true,  show: true },
          { key: 'callbacks', icon: 'call',      label: 'Перезвоны', count: 4,         red: false, show: access.canViewCallbacks },
        ].filter(t => t.show).map(tab => {
          const isActive = pageTab === tab.key
          return (
            <div key={tab.key} onClick={() => setPageTab(tab.key as 'tickets' | 'callbacks')} style={{
              padding: '14px 20px',
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
              cursor: 'pointer',
              borderBottom: `3px solid ${isActive ? 'var(--md-sys-color-primary)' : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              transition: 'color .15s, border-color .15s',
            }}>
              <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 20, fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>{tab.icon}</span>
              {tab.label}
              <span style={{
                background: tab.red ? 'var(--md-sys-color-error)' : '#F0A830',
                color: '#fff', fontSize: 11, fontWeight: 700,
                borderRadius: 9999, padding: '2px 8px', minWidth: 20, textAlign: 'center',
              }}>{tab.count}</span>
            </div>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {pageTab === 'tickets' ? (
          <>
            {/* Feed */}
            <div style={{ width: 400, minWidth: 340, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_TABS.map(st => (
                    <span key={st.key} onClick={() => setStatus(st.key)}
                      className={`md3-chip ${statusFilter === st.key ? 'md3-chip--selected' : ''}`}>
                      {st.label}
                    </span>
                  ))}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--md-sys-color-surface-container)',
                  borderRadius: 9999,
                  padding: '0 14px',
                  height: 44,
                }}>
                  <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 20, color: 'var(--md-sys-color-on-surface-variant)' }}>search</span>
                  <input
                    placeholder="Поиск по ID, описанию…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--md-sys-color-on-surface)',
                      font: '500 14px/20px var(--md-sys-typescale-font)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{filtered.length} заявок</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.length === 0 && !loading && (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
                    <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 40, opacity: .35, display: 'block', marginBottom: 8 }}>inbox</span>
                    Заявок не найдено
                  </div>
                )}
                {filtered.map(t => <TicketCard key={t.id} t={t} selected={selected?.id === t.id} onSelect={() => setSelected(t === selected ? null : t)} onOpen={() => navigate(`/tickets/${t.id}`)} />)}
              </div>
            </div>
            {/* Detail */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TicketDetail ticket={selected} technicians={technicians ?? []} onAssigned={refetch} onResolved={() => { refetch(); setSelected(null) }} access={access} />
            </div>
          </>
        ) : <CallbacksPanel refetchTickets={refetch} />}
      </div>

      <CreateTicketModal
        open={createOpen}
        onClose={() => { setCreate(false); setCreateForObjectId(undefined) }}
        onCreated={refetch}
        objects={objectsData?.items ?? []}
        initialObjectId={createForObjectId}
      />
    </div>
  )
}
