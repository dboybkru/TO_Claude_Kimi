import { useEffect, useMemo, useRef, useState } from 'react'
import { routesApi } from '../api/services'
import { useMutation } from '../api/useApi'
import type { ObjectType, RoutePlanRequest, RoutePlanResponse, RouteStop } from '../api/types'

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

function RouteMap({ plan }: { plan: RoutePlanResponse | null }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (leafletRef.current || !mapRef.current) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    const map = L.map(mapRef.current, {
      center: [54.76, 20.85],
      zoom: 9,
      zoomControl: true,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map)
    leafletRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 100)
  }, [])

  useEffect(() => {
    if (!leafletRef.current || !layerRef.current || !plan) return
    const L = (window as unknown as { L: typeof import('leaflet') }).L
    layerRef.current.clearLayers()

    const points: [number, number][] = [[plan.start_lat, plan.start_lng]]
    plan.stops.forEach((stop) => points.push([stop.lat, stop.lng]))
    if (plan.end_lat && plan.end_lng) points.push([plan.end_lat, plan.end_lng])

    L.circleMarker([plan.start_lat, plan.start_lng], {
      radius: 7,
      color: '#e2e8f0',
      fillColor: '#0ea5e9',
      fillOpacity: 0.95,
      weight: 2,
    }).bindPopup('Старт').addTo(layerRef.current)

    plan.stops.forEach((stop) => {
      const icon = L.icon({
        iconUrl: markerSvg(stop.order, '#1a7dbd'),
        iconSize: [34, 42],
        iconAnchor: [17, 42],
        popupAnchor: [0, -38],
      })
      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<b>${stop.order}. ${stop.name}</b><br>${stop.address}<br>${stop.travel_minutes} мин дороги, ${stop.service_minutes} мин ТО`)
        .addTo(layerRef.current!)
    })

    L.polyline(points, { color: '#38bdf8', weight: 3, opacity: 0.85 }).addTo(layerRef.current)
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

export default function RoutesPage() {
  const [region, setRegion] = useState('')
  const [objectType, setObjectType] = useState<ObjectType | ''>('')
  const [workday, setWorkday] = useState(480)
  const [service, setService] = useState(45)
  const [reserve, setReserve] = useState(45)
  const [speed, setSpeed] = useState(45)
  const [plan, setPlan] = useState<RoutePlanResponse | null>(null)
  const { mutate, loading, error } = useMutation((data: RoutePlanRequest) => routesApi.plan(data))

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
      limit: 500,
    })
    if (result) setPlan(result)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          <span style={{ color: '#4d7a9e' }}>Дашборд</span>
          <span style={{ color: '#2a4460', margin: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text-1)' }}>Маршруты</span>
        </span>
        <div style={{ flex: 1 }} />
        {plan && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{plan.stops.length} точек в рабочий день</span>}
        <button className="topbar-btn btn-primary" disabled={loading} onClick={build}>{loading ? 'Расчет...' : 'Построить'}</button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '390px 1fr', minHeight: 0, overflow: 'hidden' }}>
        <aside style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gap: 12 }}>
            {error && <div style={{ color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 6, padding: 8, fontSize: 12 }}>{error}</div>}
            <Field label="Регион">
              <input style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} placeholder="например: г. Калининград" />
            </Field>
            <Field label="Тип">
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
          </div>

          {summary && (
            <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {summary.map(([label, value]) => (
                <div key={label} style={{ background: '#091624', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 10px' }}>
                  <div style={{ color: 'var(--text-4)', fontSize: 10, marginBottom: 4 }}>{label}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!plan && <div style={{ padding: 28, color: 'var(--text-4)', fontSize: 13, textAlign: 'center' }}>Задайте параметры и постройте маршрут на день.</div>}
            {plan?.stops.map(stop => <StopRow key={stop.object_id} stop={stop} />)}
            {plan && plan.skipped > 0 && (
              <div style={{ padding: 12, color: 'var(--orange)', fontSize: 12, borderTop: '1px solid var(--border)' }}>
                Не вошло в день: {plan.skipped}. Увеличьте время, уменьшите длительность ТО или сузьте регион.
              </div>
            )}
          </div>
        </aside>

        <main style={{ position: 'relative', minHeight: 0, background: '#07111d' }}>
          <RouteMap plan={plan} />
        </main>
      </div>
    </div>
  )
}
