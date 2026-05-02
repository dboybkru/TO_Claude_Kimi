import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, useMutation } from '../api/useApi'
import { objectsApi, voiceApi } from '../api/services'
import { downloadCSV } from '../utils/csvExport'
import { getAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { seedApi } from '../api/services'
import type { ObjectItem, ObjectCreate, ObjectType, ObjectStatus } from '../api/types'
import Modal from '../components/Modal'
import { FormField, inputCss, selectCss, textareaCss } from '../components/FormField'

// ── Static mock (fallback) ────────────────────────────────────────────────────
const MOCK_OBJECTS: Partial<ObjectItem>[] = [
  { id: 'ОБЖ-101', name: 'ТЦ «Орион»',             address: 'ул. Ленина, 45, Калининград',        type: 'OS_OTS', region: 'Центральный', status: 'in_repair', last_maintenance_at: '2024-11-15', lat: 54.7104, lng: 20.5100 },
  { id: 'ОБЖ-045', name: 'БЦ «Горизонт»',           address: 'пр. Мира, 18, Калининград',          type: 'SKUD',   region: 'Северный',   status: 'in_repair', last_maintenance_at: '2025-01-10', lat: 54.7250, lng: 20.5280 },
  { id: 'ОБЖ-067', name: 'Склад № 3 ООО «Логист»',  address: 'ул. Садовая, 7, Калининград',        type: 'OS',     region: 'Южный',      status: 'active',    last_maintenance_at: '2024-12-20', lat: 54.6900, lng: 20.4850 },
  { id: 'ОБЖ-089', name: 'Офис «Арсенал»',           address: 'ул. Кирова, 31, Калининград',        type: 'OS_OTS', region: 'Западный',   status: 'active',    last_maintenance_at: '2025-01-05', lat: 54.7050, lng: 20.4650 },
  { id: 'ОБЖ-112', name: 'Завод «Энергомаш»',        address: 'пр. Октября, 88, Калининград',       type: 'OS',     region: 'Восточный',  status: 'active',    last_maintenance_at: '2025-02-01', lat: 54.7180, lng: 20.5600 },
  { id: 'ОБЖ-034', name: 'Банк «Капитал»',            address: 'ул. Пушкина, 5, Калининград',        type: 'SKUD_OS',region: 'Центральный',status: 'active',    last_maintenance_at: '2025-01-12', lat: 54.7080, lng: 20.5020 },
  { id: 'ОБЖ-055', name: 'Школа № 17',               address: 'ул. Гагарина, 22, Калининград',      type: 'OS',     region: 'Северный',   status: 'active',    last_maintenance_at: '2025-02-10', lat: 54.7310, lng: 20.5150 },
  { id: 'ОБЖ-118', name: 'Медцентр «Здоровье»',      address: 'ул. Чернышевского, 10, Черняховск',  type: 'SKUD',   region: 'Восточный',  status: 'in_repair', last_maintenance_at: '2024-11-05', lat: 54.6332, lng: 21.8120 },
  { id: 'ОБЖ-125', name: 'Порт «Балтийск»',          address: 'ул. Портовая, 1, Балтийск',          type: 'OS_OTS', region: 'Западный',   status: 'active',    last_maintenance_at: '2025-02-20', lat: 54.6500, lng: 19.9050 },
  { id: 'ОБЖ-130', name: 'Аэропорт «Храброво»',      address: 'пос. Храброво, Калининград р-н',     type: 'OS_OTS', region: 'Северный',   status: 'active',    last_maintenance_at: '2025-02-18', lat: 54.8900, lng: 20.5920 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string>   = { OS: 'ОПС', OTS: 'ОТС', SKUD: 'СКУД', OS_OTS: 'ОПС+ОТС', SKUD_OS: 'СКУД+ОПС' }
const TYPE_COLORS: Record<string, [string, string]> = {
  OS:     ['#0a1f3a', '#4d8aba'],
  OTS:    ['#0a1f3a', '#4d8aba'],
  SKUD:   ['#1a0a3a', '#8a6adf'],
  OS_OTS: ['#0a2018', '#3aaa70'],
  SKUD_OS:['#0a2018', '#3aaa70'],
}
const STATUS_LABELS: Record<string, string> = { active: 'В норме', in_repair: 'В ремонте', inactive: 'Неактивен' }
const STATUS_CHIP: Record<string, string>   = { active: 'chip-green', in_repair: 'chip-red', inactive: 'chip-gray' }
const REGIONS = [
  'Все районы',
  'г. Калининград', 'г. Черняховск', 'г. Советск', 'г. Гусев', 'г. Гвардейск',
  'г. Зеленоградск', 'г. Балтийск', 'г. Светлогорск', 'г. Нестеров', 'г. Правдинск',
  'г. Неман', 'г. Светлый', 'г. Пионерский', 'г. Гурьевск', 'г. Озерск', 'г. Полесск',
  'г. Краснознаменск', 'г. Мамоново', 'г. Ладушкин', 'г. Знаменск',
  'Багратионовский р-н', 'Гвардейский р-н', 'Гусевский р-н', 'Гурьевский р-н',
  'Зеленоградский р-н', 'Краснознаменский р-н', 'Неманский р-н', 'Нестеровский р-н',
  'Озерский р-н', 'Полесский р-н', 'Правдинский р-н', 'Светловский р-н',
  'Светлогорский р-н', 'Славский р-н', 'Черняховский р-н',
]
const TYPES   = ['Все типы', 'ОПС', 'СКУД', 'ОПС+ОТС', 'СКУД+ОПС']
const STATUSES_F = ['Все статусы', 'В норме', 'В ремонте', 'Неактивен']

function markerColor(s: string) { return { active: '#27ae60', in_repair: '#e74c3c', inactive: '#6b7280' }[s] ?? '#27ae60' }

function makeSvgMarker(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}" stroke="#000" stroke-width="1" stroke-opacity="0.4"/><circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// ── Leaflet Map ───────────────────────────────────────────────────────────────
function LeafletMap({ objects, selected, onSelect }: { objects: Partial<ObjectItem>[]; selected: Partial<ObjectItem> | null; onSelect: (o: Partial<ObjectItem>) => void }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (leafletRef.current || !mapRef.current) return
    const tryInit = (n: number) => {
      if (!mapRef.current || ((mapRef.current.offsetHeight === 0 || mapRef.current.offsetWidth === 0) && n > 0)) { setTimeout(() => tryInit(n - 1), 120); return }
      try {
        const L = (window as unknown as { L: typeof import('leaflet') }).L
        const m = L.map(mapRef.current!, { center: [54.78, 20.60], zoom: 8, zoomControl: true, attributionControl: false })
        // Dark theme tiles — CartoDB Dark Matter
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
        }).addTo(m)
        leafletRef.current = m
        setTimeout(() => { try { m.invalidateSize() } catch { /**/ }; setReady(true) }, 100)
      } catch { /**/ }
    }
    setTimeout(() => tryInit(10), 100)
  }, [])

  useEffect(() => {
    if (!ready || !leafletRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    Object.values(markersRef.current).forEach(m => { try { m.remove() } catch { /**/ } })
    markersRef.current = {}
    objects.forEach(obj => {
      if (!obj.lat || !obj.lng) return
      try {
        const icon = L.icon({ iconUrl: makeSvgMarker(markerColor(obj.status ?? 'active')), iconSize: [24, 32], iconAnchor: [12, 32], popupAnchor: [0, -32] })
        const mk = L.marker([obj.lat, obj.lng], { icon }).addTo(leafletRef.current!)
          .bindPopup(`<div style="font-size:12px;color:#c5d8ea;background:#0d1d2c;padding:4px 6px"><b>${obj.name}</b><br><span style="color:#4d6e88;font-size:10px">${obj.address}</span></div>`)
        mk.on('click', () => onSelect(obj))
        markersRef.current[obj.id!] = mk
      } catch { /**/ }
    })
  }, [ready, objects])

  useEffect(() => {
    if (!ready || !leafletRef.current || !selected?.lat) return
    const mk = markersRef.current[selected.id!]
    if (mk) { leafletRef.current.setView([selected.lat!, selected.lng!], 13, { animate: true }); mk.openPopup() }
  }, [ready, selected])

  return <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
}

// ── Create Object Form ────────────────────────────────────────────────────────
const EMPTY_FORM: ObjectCreate = { name: '', address: '', type: 'OS', region: '', status: 'active', contract_number: '', notes: '', monthly_maintenance_required: true }

function CreateObjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<ObjectCreate>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, loading, error } = useMutation((data: ObjectCreate) => objectsApi.create(data))

  function f(k: keyof ObjectCreate) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value })) }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Обязательное поле'
    if (!form.address.trim()) e.address = 'Обязательное поле'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    const result = await mutate({ ...form, address_normalized: form.address.toLowerCase() })
    if (result) { setForm(EMPTY_FORM); onCreated(); onClose() }
  }

  return (
    <Modal open={open} title="Добавить объект" onClose={onClose} onConfirm={submit} confirmLoading={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <FormField label="Наименование" required error={errors.name}><input style={inputCss} value={form.name} onChange={f('name')} placeholder="ТЦ «Орион»" /></FormField>
        <FormField label="Адрес" required error={errors.address}><input style={inputCss} value={form.address} onChange={f('address')} placeholder="ул. Ленина, 45, Калининград" /></FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Тип системы">
            <select style={selectCss} value={form.type} onChange={f('type')}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Статус">
            <select style={selectCss} value={form.status} onChange={f('status')}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Район / Регион"><input style={inputCss} value={form.region ?? ''} onChange={f('region')} placeholder="г. Калининград" list="regions-list" />
            <datalist id="regions-list">{REGIONS.slice(1).map(r => <option key={r} value={r} />)}</datalist>
          </FormField>
          <FormField label="№ Договора"><input style={inputCss} value={form.contract_number ?? ''} onChange={f('contract_number')} placeholder="ДОГ-2024-001" /></FormField>
        </div>
        <FormField label="Примечания"><textarea style={textareaCss} value={form.notes ?? ''} onChange={f('notes')} placeholder="Дополнительная информация…" /></FormField>
      </div>
    </Modal>
  )
}

// ── Edit Object Modal ─────────────────────────────────────────────────────────
function EditObjectModal({ obj, open, onClose, onSaved }: { obj: Partial<ObjectItem> | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<ObjectCreate>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, loading, error } = useMutation(({ id, data }: { id: string; data: Partial<ObjectCreate> }) => objectsApi.update(id, data))

  useEffect(() => {
    if (obj) setForm({ name: obj.name, address: obj.address, type: obj.type, status: obj.status, region: obj.region ?? '', contract_number: obj.contract_number ?? '', notes: obj.notes ?? '', monthly_maintenance_required: obj.monthly_maintenance_required })
  }, [obj?.id])

  if (!obj) return null
  const objId = obj.id as string
  function f(k: keyof ObjectCreate) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value })) }

  async function submit() {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = 'Обязательное поле'
    if (!form.address?.trim()) e.address = 'Обязательное поле'
    setErrors(e)
    if (Object.keys(e).length) return
    const result = await mutate({ id: objId, data: { ...form, address_normalized: form.address?.toLowerCase() } })
    if (result) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} title={`Редактировать: ${obj.name}`} onClose={onClose} onConfirm={submit} confirmLoading={loading} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <FormField label="Наименование" required error={errors.name}><input style={inputCss} value={form.name ?? ''} onChange={f('name')} /></FormField>
        <FormField label="Адрес" required error={errors.address}><input style={inputCss} value={form.address ?? ''} onChange={f('address')} /></FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Тип системы">
            <select style={selectCss} value={form.type ?? 'OS'} onChange={f('type')}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Статус">
            <select style={selectCss} value={form.status ?? 'active'} onChange={f('status')}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Район / Регион"><input style={inputCss} value={form.region ?? ''} onChange={f('region')} /></FormField>
          <FormField label="№ Договора"><input style={inputCss} value={form.contract_number ?? ''} onChange={f('contract_number')} /></FormField>
        </div>
        <FormField label="Примечания"><textarea style={textareaCss} value={form.notes ?? ''} onChange={f('notes')} /></FormField>
      </div>
    </Modal>
  )
}

// ── AI Object Report ─────────────────────────────────────────────────────────
function ObjectAiReport({ objectId }: { objectId: string }) {
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setLoading(true); setError(''); setExpanded(true)
    try {
      const res = await voiceApi.objectReport(objectId)
      setReport(res.report)
    } catch {
      setError('Не удалось сгенерировать отчёт. Проверьте AI настройки.')
    } finally {
      setLoading(false)
    }
  }

  if (report) return (
    <div>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 12px', background: '#1a0a3a', border: '1px solid #3a1a6a', borderRadius: expanded ? '8px 8px 0 0' : 8 }}>
        <span>🤖</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--purple)', fontWeight: 600 }}>AI Отчёт по объекту</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ background: '#110a20', border: '1px solid #3a1a6a', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '10px 12px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.65, maxHeight: 220, overflowY: 'auto' }}>
          {report}
          <div style={{ marginTop: 8 }}>
            <span onClick={generate} style={{ fontSize: 11, color: '#4d7a9e', cursor: 'pointer' }}>↻ Обновить</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <button disabled={loading} onClick={generate}
        style={{ width: '100%', padding: 10, borderRadius: 8, background: loading ? '#1a2e42' : '#1a0a3a', color: loading ? 'var(--text-4)' : 'var(--purple)', border: '1px solid #3a1a6a', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span>🤖</span>{loading ? 'AI строит отчёт…' : 'AI Отчёт по объекту'}
      </button>
      {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ obj, onClose, onCreateJournal, onCreateTicket, onEdit, access }: {
  obj: Partial<ObjectItem> | null
  onClose: () => void
  onCreateJournal: (id: string) => void
  onCreateTicket: (id: string) => void
  onEdit: (obj: Partial<ObjectItem>) => void
  access: ReturnType<typeof getAccess>
}) {
  if (!obj) return null
  const s = obj.status ?? 'active'
  return (
    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 320, background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 20, boxShadow: '-8px 0 32px #000a' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 3 }}>{obj.id?.slice(0, 8)} · {TYPE_LABELS[obj.type ?? 'OS']} · {obj.region}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f1fa', lineHeight: 1.3 }}>{obj.name}</div>
            <div style={{ marginTop: 6 }}>
              <span className={`chip ${STATUS_CHIP[s]}`}><span className="chip-dot" style={{ background: markerColor(s) }} />{STATUS_LABELS[s]}</span>
            </div>
          </div>
          <div onClick={onClose} style={{ width: 26, height: 26, background: '#112030', border: '1px solid #1e3347', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>✕</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Сведения</div>
          {[
            ['Адрес', obj.address],
            ['Район', obj.region],
            ['№ договора', obj.contract_number ?? '—'],
            ['Тип системы', TYPE_LABELS[obj.type ?? 'OS']],
            ['Ежемес. ТО', obj.monthly_maintenance_required ? 'Да' : 'Нет'],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-inner)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</span>
              <span style={{ fontSize: 12, color: '#b0cde0', fontWeight: 500, textAlign: 'right', maxWidth: 160 }}>{String(v ?? '—')}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Обслуживание</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Последнее ТО</span>
            <span style={{ fontSize: 12, color: obj.last_maintenance_at ? 'var(--green)' : 'var(--orange)', fontWeight: 500 }}>
              {obj.last_maintenance_at ? new Date(obj.last_maintenance_at).toLocaleDateString('ru-RU') : 'Не было'}
            </span>
          </div>
        </div>
        {obj.notes && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{obj.notes}</div>
        )}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        {access.canCreateJournal && <button onClick={() => onCreateJournal(obj.id!)} style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>📋 Создать журнал ТО</button>}
        {access.canCreateTicket  && <button onClick={() => onCreateTicket(obj.id!)} style={{ width: '100%', padding: 10, borderRadius: 8, background: 'transparent', color: '#62b8f5', border: '1px solid #1a7dbd44', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🔧 Создать заявку</button>}
        <ObjectAiReport objectId={obj.id!} />
        {access.canEditObject    && <button onClick={() => onEdit(obj)} style={{ width: '100%', padding: 10, borderRadius: 8, background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border-mid)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✏ Редактировать объект</button>}
      </div>
    </div>
  )
}

// ── Address Autocomplete Input ───────────────────────────────────────────────
function AddressAutocomplete({ onSelect }: { onSelect: (obj: ObjectItem) => void }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ObjectItem[]>([])
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setSuggestions([])
      setShow(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const items = await objectsApi.search(query.trim())
        setSuggestions(items)
        setShow(items.length > 0)
      } catch {
        setSuggestions([])
        setShow(false)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2d4a62', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
      <input
        className="filter-input"
        style={{ paddingLeft: 32, width: 260 }}
        placeholder="Поиск по названию, адресу…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShow(true) }}
      />
      {show && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 50, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px #0008' }}>
          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-4)' }}>Поиск…</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-4)' }}>Ничего не найдено</div>
          )}
          {suggestions.map(obj => (
            <div
              key={obj.id}
              onClick={() => { onSelect(obj); setQuery(''); setShow(false); setSuggestions([]) }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-inner)', fontSize: 12 }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{obj.name}</div>
              <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2 }}>{obj.address}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Objects Page ──────────────────────────────────────────────────────────────
export default function Objects() {
  const navigate    = useNavigate()
  const access      = getAccess(useAuthStore(s => s.user?.role))
  const { data, loading, error, refetch } = useApi(() => objectsApi.list({ size: 200 }))
  const { mutate: runSeed, loading: seeding } = useMutation((_: void) => seedApi.seedObjects())
  const [search, setSearch]     = useState('')
  const [filterType, setType]   = useState('Все типы')
  const [filterDist, setDist]   = useState('Все районы')
  const [filterStat, setStat]   = useState('Все статусы')
  const [sortKey, setSortKey]   = useState('status')
  const [sortDir, setSortDir]   = useState(1)
  const [selected, setSelected] = useState<Partial<ObjectItem> | null>(null)
  const [createOpen, setCreate] = useState(false)
  const [editTarget, setEdit]   = useState<Partial<ObjectItem> | null>(null)

  const allObjects: Partial<ObjectItem>[] = data?.items ?? (error === 'backend_down' ? MOCK_OBJECTS : [])

  const filtered = useMemo(() => {
    let d = allObjects
    if (search) d = d.filter(o => (o.name ?? '').toLowerCase().includes(search.toLowerCase()) || (o.address ?? '').toLowerCase().includes(search.toLowerCase()))
    if (filterType !== 'Все типы') { const rev = Object.entries(TYPE_LABELS).find(([, v]) => v === filterType)?.[0]; if (rev) d = d.filter(o => o.type === rev) }
    if (filterDist !== 'Все районы') d = d.filter(o => o.region === filterDist)
    if (filterStat !== 'Все статусы') { const rev = Object.entries(STATUS_LABELS).find(([, v]) => v === filterStat)?.[0]; if (rev) d = d.filter(o => o.status === rev) }
    return [...d].sort((a, b) => {
      let va: unknown = a[sortKey as keyof ObjectItem], vb: unknown = b[sortKey as keyof ObjectItem]
      if (sortKey === 'status') { const o: Record<string, number> = { in_repair: 0, inactive: 1, active: 2 }; va = o[a.status ?? 'active'] ?? 2; vb = o[b.status ?? 'active'] ?? 2 }
      if (va! < vb!) return -sortDir
      if (va! > vb!) return sortDir
      return 0
    })
  }, [allObjects, search, filterType, filterDist, filterStat, sortKey, sortDir])

  const COLS: [string, string][] = [['name','Название / Адрес'],['type','Тип'],['region','Район'],['status','Статус'],['last_maintenance_at','Посл. ТО']]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          <span style={{ color: '#4d7a9e' }}>Дашборд</span>
          <span style={{ color: '#2a4460', margin: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text-1)' }}>Объекты</span>
        </span>
        {allObjects.filter(o => o.status === 'in_repair').length > 0 && <span className="chip chip-red">⚠ В ремонте: {allObjects.filter(o => o.status === 'in_repair').length}</span>}
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Загрузка…</span>}
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} из {allObjects.length}</span>
        {access.canExport && <button className="topbar-btn btn-outline" onClick={() => {
          downloadCSV([
            ['Название', 'Адрес', 'Тип', 'Район', 'Статус', '№ Договора', 'Последнее ТО', 'Примечания'],
            ...filtered.map(o => [o.name, o.address, TYPE_LABELS[o.type ?? 'OS'], o.region, STATUS_LABELS[o.status ?? 'active'], o.contract_number, o.last_maintenance_at ? new Date(o.last_maintenance_at).toLocaleDateString('ru-RU') : '', o.notes]),
          ], `objects_${new Date().toISOString().slice(0,10)}.csv`)
        }}>⬇ Экспорт</button>}
        {access.isAdmin && allObjects.length === 0 && error !== 'backend_down' && (
          <button className="topbar-btn btn-outline" disabled={seeding} onClick={async () => { await runSeed(undefined); refetch() }}
            style={{ color: 'var(--orange)', borderColor: '#d9770644' }}>
            {seeding ? '⏳ Загрузка…' : '📂 Загрузить объекты из ТЗ'}
          </button>
        )}
        {access.canCreateObject && <button className="topbar-btn btn-primary" onClick={() => setCreate(true)}>+ Добавить</button>}
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', background: '#0b1825', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' as const }}>
        <AddressAutocomplete onSelect={obj => setSelected(obj)} />
        {([[TYPES, filterType, setType], [REGIONS, filterDist, setDist], [STATUSES_F, filterStat, setStat]] as [string[], string, (v: string) => void][]).map(([list, val, setter], i) => (
          <select key={i} value={val} onChange={e => setter(e.target.value)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 7, color: '#8aacbf', fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}>
            {list.map(t => <option key={t} style={{ background: 'var(--bg-panel)' }}>{t}</option>)}
          </select>
        ))}
        {(search || filterType !== 'Все типы' || filterDist !== 'Все районы' || filterStat !== 'Все статусы') &&
          <span onClick={() => { setSearch(''); setType('Все типы'); setDist('Все районы'); setStat('Все статусы') }} style={{ fontSize: 11, color: '#4d7a9e', cursor: 'pointer' }}>✕ Сбросить</span>}
      </div>

      {/* Split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, borderRight: '1px solid var(--border)' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>🏢 Объекты не найдены</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr>
                    {COLS.map(([k, l]) => (
                      <th key={k} onClick={() => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(1) } }}
                        style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', position: 'sticky', top: 0, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                        {l}{sortKey === k && <span style={{ marginLeft: 4, opacity: 0.5 }}>{sortDir > 0 ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', background: 'var(--bg-card)', position: 'sticky', top: 0, borderBottom: '1px solid var(--border)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(obj => {
                    const [tbg, tc] = TYPE_COLORS[obj.type ?? 'OS'] ?? TYPE_COLORS.OS
                    const s = obj.status ?? 'active'
                    const isSel = selected?.id === obj.id
                    const td = (content: React.ReactNode) => (
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', background: isSel ? '#0c2035' : 'transparent', verticalAlign: 'middle' }}>{content}</td>
                    )
                    return (
                      <tr key={obj.id} onClick={() => setSelected(obj === selected ? null : obj)} style={{ cursor: 'pointer' }}>
                        {td(<><div style={{ color: 'var(--text-1)', fontWeight: 500, fontSize: 12.5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.name}</div><div style={{ fontSize: 10, color: 'var(--text-4)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.address}</div></>)}
                        {td(<span style={{ background: tbg, color: tc, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{TYPE_LABELS[obj.type ?? 'OS']}</span>)}
                        {td(<span style={{ color: 'var(--text-2)' }}>{obj.region ?? '—'}</span>)}
                        {td(<span className={`chip ${STATUS_CHIP[s]}`}><span className="chip-dot" style={{ background: markerColor(s) }} />{STATUS_LABELS[s]}</span>)}
                        {td(<span style={{ color: obj.last_maintenance_at ? 'var(--green)' : 'var(--orange)', whiteSpace: 'nowrap' }}>{obj.last_maintenance_at ? new Date(obj.last_maintenance_at).toLocaleDateString('ru-RU') : 'Не было'}</span>)}
                        {td(
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={e => { e.stopPropagation(); setSelected(obj) }} style={{ background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: 6, color: '#62b8f5', fontSize: 11, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>Панель</button>
                            <button onClick={e => { e.stopPropagation(); navigate(`/objects/${obj.id}`) }} style={{ background: '#0e2a42', border: '1px solid #1a3a5c', borderRadius: 6, color: '#62b8f5', fontSize: 11, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>Страница →</button>
                          </div>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Map */}
        <div style={{ width: 420, minWidth: 320, display: 'flex', flexDirection: 'column', background: '#0b1825', flexShrink: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>📍 Калининградская область</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {[['#27ae60','В норме'],['#e74c3c','В ремонте']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            <LeafletMap objects={filtered} selected={selected} onSelect={o => setSelected(o === selected ? null : o)} />
          </div>
        </div>
      </div>

      {/* Modals & panels */}
      <CreateObjectModal open={createOpen} onClose={() => setCreate(false)} onCreated={refetch} />
      <EditObjectModal obj={editTarget} open={!!editTarget} onClose={() => setEdit(null)} onSaved={refetch} />
      <DetailPanel
        obj={selected}
        onClose={() => setSelected(null)}
        onCreateJournal={(id) => navigate('/journals', { state: { createJournalForObject: id } })}
        onCreateTicket={(id) => navigate('/tickets', { state: { createTicketForObject: id } })}
        onEdit={(obj) => setEdit(obj)}
        access={access}
      />
    </div>
  )
}
