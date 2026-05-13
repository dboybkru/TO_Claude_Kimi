import { useEffect, useMemo, useRef, useState } from 'react'
import { routesApi, objectsApi } from '../api/services'
import { useMutation } from '../api/useApi'
import type { ObjectItem, ObjectType, RoutePlanRequest, RoutePlanResponse, RouteStop } from '../api/types'

const TYPE_OPTIONS: { label: string; value: ObjectType | '' }[] = [
  { label: 'Все типы', value: '' },
  { label: 'ОС', value: 'OS' },
  { label: 'ОТС', value: 'OTS' },
  { label: 'СКУД', value: 'SKUD' },
  { label: 'ОС/ОТС', value: 'OS_OTS' },
  { label: 'СКУД+ОС', value: 'SKUD_OS' },
]

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-mid)',
  borderRadius: 7,
  color: '#c5d8ea',
  fontSize: 12,
  padding: '7px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

function formatMinutes(value: number) {
  const h = Math.floor(value / 60)
  const m = value % 60
  if (!h) return `${m} мин`
  return `${h} ч ${m} мин`
}

function markerSvg(order: number, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42"><path d="M17 0C7.6 0 0 7.6 0 17c0 12.2 17 25 17 25s17-12.8 17-25C34 7.6 26.4 0 17 0z" fill="${color}" stroke="#06101d" stroke-width="2"/><text x="17" y="22" font-family="Arial" font-size="13" fill="white" font-weight="700" text-anchor="middle">${order}</text></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/** Цвет маркера по дате последнего ТО */
function maintenanceColor(lastAt?: string): string {
  if (!lastAt) return '#ef4444' // никогда — красный
  const days = (Date.now() - new Date(lastAt).getTime()) / 86_400_000
  if (days <= 30) return '#22c55e'  // свежее — зелёный
  if (days <= 60) return '#f97316'  // просрочено — оранжевый
  return '#ef4444'                  // давно — красный
}

function maintenanceLabel(lastAt?: string): string {
  if (!lastAt) return 'ТО не проводилось'
  const days = Math.floor((Date.now() - new Date(lastAt).getTime()) / 86_400_000)
  if (days === 0) return 'ТО сегодня'
  if (days === 1) return 'ТО вчера'
  return `ТО ${days} дн. назад`
}

interface RouteMapProps {
  plan: RoutePlanResponse | null
  allObjects: ObjectItem[]
  showAll: boolean
  startLat: number
  startLng: number
  onMapClick: (lat: number, lng: number) => void
  planObjectIds: Set<string>
}

function RouteMap({ plan, allObjects, showAll, startLat, startLng, onMapClick, planObjectIds }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const allLayerRef = useRef<L.LayerGroup | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)

  // Init map
  useEffect(() => {
    if (leafletRef.current || !mapRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    const map = L.map(mapRef.current, {
      center: [54.76, 20.85],
      zoom: 9,
      zoomControl: true,
      attributionControl: false,
    })
    // CartoDB Dark Matter — настоящий EPSG:3857 (Web Mercator).
    // Не используем Yandex тайлы напрямую: они в EPSG:3395, что даёт
    // вертикальный сдвиг ~10-15 км относительно правильных координат.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map)
    leafletRef.current = map
    allLayerRef.current = L.layerGroup().addTo(map)
    routeLayerRef.current = L.layerGroup().addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    })

    setTimeout(() => map.invalidateSize(), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render all-objects layer
  useEffect(() => {
    if (!leafletRef.current || !allLayerRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    allLayerRef.current.clearLayers()
    if (!showAll) return

    allObjects.forEach((obj) => {
      if (!obj.lat || !obj.lng) return
      const inRoute = planObjectIds.has(obj.id)
      if (inRoute) return // not duplicate — route layer shows these
      const color = maintenanceColor(obj.last_maintenance_at)
      L.circleMarker([obj.lat, obj.lng], {
        radius: 6,
        color: '#06101d',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.82,
      })
        .bindPopup(
          `<b>${obj.name}</b><br><span style="color:#94a3b8">${obj.address}</span><br>` +
          `<span style="color:${color}">${maintenanceLabel(obj.last_maintenance_at)}</span>` +
          (obj.region ? `<br><span style="color:#64748b">${obj.region}</span>` : '')
        )
        .addTo(allLayerRef.current!)
    })
  }, [allObjects, showAll, planObjectIds])

  // Render start marker
  useEffect(() => {
    if (!leafletRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    if (startMarkerRef.current) startMarkerRef.current.remove()
    startMarkerRef.current = L.circleMarker([startLat, startLng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 1,
    }).bindPopup('Точка старта').addTo(leafletRef.current)
  }, [startLat, startLng])

  // Render route
  useEffect(() => {
    if (!leafletRef.current || !routeLayerRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    routeLayerRef.current.clearLayers()
    if (!plan) return

    const points: [number, number][] = [[plan.start_lat, plan.start_lng]]
    plan.stops.forEach((stop) => points.push([stop.lat, stop.lng]))
    if (plan.end_lat && plan.end_lng) points.push([plan.end_lat, plan.end_lng])

    plan.stops.forEach((stop) => {
      const icon = L.icon({
        iconUrl: markerSvg(stop.order, '#1a7dbd'),
        iconSize: [34, 42],
        iconAnchor: [17, 42],
        popupAnchor: [0, -38],
      })
      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(
          `<b>${stop.order}. ${stop.name}</b><br>${stop.address}<br>` +
          `<span style="color:#94a3b8">${stop.travel_minutes} мин дороги, ${stop.service_minutes} мин ТО</span>`
        )
        .addTo(routeLayerRef.current!)
    })

    L.polyline(points, { color: '#38bdf8', weight: 3, opacity: 0.85 }).addTo(routeLayerRef.current)
    if (points.length > 1) leafletRef.current.fitBounds(L.latLngBounds(points), { padding: [36, 36] })
  }, [plan])

  return <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
    </label>
  )
}

function StopRow({ stop }: { stop: RouteStop }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: '#123a5c', color: '#62b8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
        {stop.order}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-1)', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.name}</div>
        <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.address}</div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
        <div>{stop.distance_km} км</div>
        <div>{formatMinutes(stop.cumulative_minutes)}</div>
      </div>
    </div>
  )
}

const DOT = (color: string) => (
  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 5, flexShrink: 0 }} />
)

export default function RoutesPage() {
  const [region, setRegion] = useState('')
  const [objectType, setObjectType] = useState<ObjectType | ''>('')
  const [workday, setWorkday] = useState(480)
  const [service, setService] = useState(45)
  const [reserve, setReserve] = useState(45)
  const [speed, setSpeed] = useState(45)
  const [startLat, setStartLat] = useState(54.7104)
  const [startLng, setStartLng] = useState(20.4522)
  const [plan, setPlan] = useState<RoutePlanResponse | null>(null)
  const [allObjects, setAllObjects] = useState<ObjectItem[]>([])
  const [showAll, setShowAll] = useState(true)
  const [tab, setTab] = useState<'params' | 'regions'>('params')
  const [mapExpanded, setMapExpanded] = useState(false)

  useEffect(() => {
    if (!mapExpanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapExpanded])

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 220)
    return () => clearTimeout(t)
  }, [mapExpanded])

  const { mutate, loading, error } = useMutation((data: RoutePlanRequest) => routesApi.plan(data))

  // Load all objects (313 items — 2 pages of 200)
  useEffect(() => {
    async function load() {
      try {
        const [p1, p2] = await Promise.all([
          objectsApi.list({ page: 1, size: 200 }),
          objectsApi.list({ page: 2, size: 200 }),
        ])
        setAllObjects([...p1.items, ...p2.items])
      } catch {
        // silent — карта без фоновых точек
      }
    }
    load()
  }, [])

  const planObjectIds = useMemo(() => new Set(plan?.stops.map(s => s.object_id) ?? []), [plan])

  // Region statistics
  const regionStats = useMemo(() => {
    const map = new Map<string, { total: number; ok: number; warn: number; danger: number }>()
    allObjects.forEach((obj) => {
      const r = obj.region || 'Без региона'
      if (!map.has(r)) map.set(r, { total: 0, ok: 0, warn: 0, danger: 0 })
      const s = map.get(r)!
      s.total++
      const color = maintenanceColor(obj.last_maintenance_at)
      if (color === '#22c55e') s.ok++
      else if (color === '#f97316') s.warn++
      else s.danger++
    })
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [allObjects])

  const summary = useMemo(() => {
    if (!plan) return null
    return [
      ['Точек', String(plan.stops.length)],
      ['Дорога', formatMinutes(plan.total_travel_minutes)],
      ['Работы', formatMinutes(plan.total_service_minutes)],
      ['Итого', formatMinutes(plan.total_minutes)],
      ['Дистанция', `${plan.total_distance_km} км`],
    ]
  }, [plan])

  async function build() {
    const result = await mutate({
      region: region || undefined,
      object_type: objectType || undefined,
      workday_minutes: workday,
      service_minutes: service,
      reserve_minutes: reserve,
      average_speed_kmh: speed,
      start_lat: startLat,
      start_lng: startLng,
      limit: 500,
    })
    if (result) setPlan(result)
  }

  function handleMapClick(lat: number, lng: number) {
    setStartLat(Math.round(lat * 100000) / 100000)
    setStartLng(Math.round(lng * 100000) / 100000)
  }

  const totalOk = allObjects.filter(o => maintenanceColor(o.last_maintenance_at) === '#22c55e').length
  const totalWarn = allObjects.filter(o => maintenanceColor(o.last_maintenance_at) === '#f97316').length
  const totalDanger = allObjects.filter(o => maintenanceColor(o.last_maintenance_at) === '#ef4444').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 56, background: 'var(--md-sys-color-surface)', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14, flexShrink: 0 }}>
        <nav aria-label="breadcrumbs" style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          <span style={{ cursor: 'pointer' }}>Дашборд</span>
          <span style={{ margin: '0 8px', color: 'var(--md-sys-color-outline)' }}>›</span>
          <span style={{ color: 'var(--md-sys-color-on-surface)', fontWeight: 500 }}>Маршруты</span>
        </nav>
        <div style={{ flex: 1 }} />

        {/* Legend */}
        {showAll && allObjects.length > 0 && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>{DOT('#52C97E')}{totalOk} свежих</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>{DOT('#F0A830')}{totalWarn} просрочено</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>{DOT('var(--md-sys-color-error)')}{totalDanger} давно/нет ТО</span>
          </div>
        )}

        <button className="md3-chip" onClick={() => setShowAll(v => !v)}>
          <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 16 }}>map</span>
          {showAll ? 'Все объекты' : 'Только маршрут'}
        </button>
        {plan && <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{plan.stops.length} точек</span>}
        <button className="md3-btn-tonal" disabled={loading} onClick={build}>
          <span className="ic" aria-hidden>{loading ? 'hourglass' : 'play_arrow'}</span>
          {loading ? 'Расчёт…' : 'Построить'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '390px 1fr', minHeight: 0, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {(['params', 'regions'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 12, border: 'none', cursor: 'pointer',
                  background: tab === t ? 'var(--bg-panel)' : 'transparent',
                  color: tab === t ? 'var(--text-1)' : 'var(--text-4)',
                  borderBottom: tab === t ? '2px solid #1a7dbd' : '2px solid transparent',
                  fontFamily: 'inherit',
                }}
              >
                {t === 'params' ? '⚙ Параметры' : `📍 Регионы (${regionStats.length})`}
              </button>
            ))}
          </div>

          {tab === 'params' && (
            <>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gap: 12, flexShrink: 0 }}>
                {error && <div style={{ color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 6, padding: 8, fontSize: 12 }}>{error}</div>}

                <Field label="Регион (фильтр для построения)">
                  <input style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} placeholder="например: г. Калининград" />
                </Field>
                <Field label="Тип систем">
                  <select style={inputStyle} value={objectType} onChange={e => setObjectType(e.target.value as ObjectType | '')}>
                    {TYPE_OPTIONS.map(opt => <option key={opt.label} value={opt.value} style={{ background: '#0d1d2c' }}>{opt.label}</option>)}
                  </select>
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Рабочий день, мин">
                    <input type="number" min={60} max={960} style={inputStyle} value={workday} onChange={e => setWorkday(Number(e.target.value))} />
                  </Field>
                  <Field label="Резерв, мин">
                    <input type="number" min={0} max={240} style={inputStyle} value={reserve} onChange={e => setReserve(Number(e.target.value))} />
                  </Field>
                  <Field label="ТО на точку, мин">
                    <input type="number" min={5} max={240} style={inputStyle} value={service} onChange={e => setService(Number(e.target.value))} />
                  </Field>
                  <Field label="Средняя скорость">
                    <input type="number" min={10} max={120} style={inputStyle} value={speed} onChange={e => setSpeed(Number(e.target.value))} />
                  </Field>
                </div>

                <div style={{ background: '#091624', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 10px', fontSize: 11 }}>
                  <div style={{ color: 'var(--text-4)', marginBottom: 4 }}>Точка старта (кликни по карте)</div>
                  <div style={{ color: '#62b8f5', fontFamily: 'monospace' }}>{startLat.toFixed(5)}, {startLng.toFixed(5)}</div>
                </div>
              </div>

              {summary && (
                <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, flexShrink: 0 }}>
                  {summary.map(([label, value]) => (
                    <div key={label} style={{ background: '#091624', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 10px' }}>
                      <div style={{ color: 'var(--text-4)', fontSize: 10, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {!plan && (
                  <div style={{ padding: 28, color: 'var(--text-4)', fontSize: 13, textAlign: 'center' }}>
                    Задайте параметры и нажмите «Построить».<br />
                    <span style={{ fontSize: 11 }}>Точку старта выбери кликом по карте.</span>
                  </div>
                )}
                {plan?.stops.map(stop => <StopRow key={stop.object_id} stop={stop} />)}
                {plan && plan.skipped > 0 && (
                  <div style={{ padding: 12, color: 'var(--orange)', fontSize: 12, borderTop: '1px solid var(--border)' }}>
                    Не вошло в день: {plan.skipped}. Сузьте регион, уменьшите ТО или увеличьте время.
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'regions' && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {regionStats.length === 0 && (
                <div style={{ padding: 24, color: 'var(--text-4)', fontSize: 13, textAlign: 'center' }}>Загрузка объектов...</div>
              )}
              {regionStats.map(([rgn, stats]) => {
                const dangerPct = Math.round(stats.danger / stats.total * 100)
                const warnPct = Math.round(stats.warn / stats.total * 100)
                const okPct = 100 - dangerPct - warnPct
                return (
                  <div
                    key={rgn}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-inner)', cursor: 'pointer' }}
                    onClick={() => { setRegion(rgn); setTab('params') }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-1)', fontSize: 12, fontWeight: 600 }}>{rgn}</span>
                      <span style={{ color: 'var(--text-4)', fontSize: 11 }}>{stats.total} объектов</span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                      {okPct > 0 && <div style={{ flex: okPct, background: '#22c55e' }} />}
                      {warnPct > 0 && <div style={{ flex: warnPct, background: '#f97316' }} />}
                      {dangerPct > 0 && <div style={{ flex: dangerPct, background: '#ef4444' }} />}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 10, color: 'var(--text-4)' }}>
                      {stats.ok > 0 && <span style={{ color: '#22c55e' }}>{stats.ok} ок</span>}
                      {stats.warn > 0 && <span style={{ color: '#f97316' }}>{stats.warn} просроч.</span>}
                      {stats.danger > 0 && <span style={{ color: '#ef4444' }}>{stats.danger} давно</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* Map */}
        <main style={mapExpanded ? {
          position: 'fixed', inset: 0, zIndex: 1000,
          background: '#07111d',
        } : {
          position: 'relative', minHeight: 0, background: '#07111d',
        }}>
          <RouteMap
            plan={plan}
            allObjects={allObjects}
            showAll={showAll}
            startLat={startLat}
            startLng={startLng}
            onMapClick={handleMapClick}
            planObjectIds={planObjectIds}
          />
          <button
            onClick={() => setMapExpanded(e => !e)}
            title={mapExpanded ? 'Свернуть карту (Esc)' : 'Развернуть карту на весь экран'}
            aria-label={mapExpanded ? 'Свернуть карту' : 'Развернуть карту'}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 500,
              width: 40, height: 40, borderRadius: 9999,
              background: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              fontFamily: 'Material Symbols Rounded', fontSize: 22,
              fontVariationSettings: "'FILL' 0, 'wght' 500",
            }}
          >
            {mapExpanded ? 'fullscreen_exit' : 'fullscreen'}
          </button>
        </main>
      </div>
    </div>
  )
}
