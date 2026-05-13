import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { objectsApi, ticketsApi, journalsApi } from '../api/services'
import type { ObjectItem, RepairTicket, MaintenanceJournal } from '../api/types'

type Result =
  | { kind: 'object';  item: Partial<ObjectItem> }
  | { kind: 'ticket';  item: RepairTicket }
  | { kind: 'journal'; item: MaintenanceJournal }

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'var(--red)', high: 'var(--orange)', normal: '#62b8f5', low: 'var(--green)',
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]) }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const [objs, tiks, jnls] = await Promise.allSettled([
        objectsApi.list({ size: 5 }),
        ticketsApi.list({ size: 5 }),
        journalsApi.list({ size: 5 }),
      ])
      const ql = q.toLowerCase()
      const out: Result[] = []

      if (objs.status === 'fulfilled') {
        objs.value.items
          .filter(o => o.name.toLowerCase().includes(ql) || o.address.toLowerCase().includes(ql) || (o.region ?? '').toLowerCase().includes(ql))
          .slice(0, 3)
          .forEach(item => out.push({ kind: 'object', item }))
      }
      if (tiks.status === 'fulfilled') {
        tiks.value.items
          .filter(t => t.title.toLowerCase().includes(ql) || t.ticket_number.toLowerCase().includes(ql) || (t.description ?? '').toLowerCase().includes(ql))
          .slice(0, 3)
          .forEach(item => out.push({ kind: 'ticket', item }))
      }
      if (jnls.status === 'fulfilled') {
        jnls.value.items
          .filter(j => String(j.journal_number ?? '').includes(ql) || (j.result_description ?? '').toLowerCase().includes(ql))
          .slice(0, 2)
          .forEach(item => out.push({ kind: 'journal', item }))
      }
      setResults(out)
      setActive(0)
    } finally {
      setLoading(false)
    }
  }, [])

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(v), 350)
  }

  function go(r: Result) {
    if (r.kind === 'object')  navigate(`/objects/${r.item.id}`)
    if (r.kind === 'ticket')  navigate(`/tickets/${r.item.id}`)
    if (r.kind === 'journal') navigate('/journals')
    setOpen(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) go(results[active])
  }

  const KIND_ICON: Record<string, string> = { object: 'apartment', ticket: 'build', journal: 'description' }
  const KIND_LABEL: Record<string, string> = { object: 'Объект', ticket: 'Заявка', journal: 'Журнал ТО' }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 80,
      fontFamily: 'var(--md-sys-typescale-font)',
    }}>
      <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 640,
        background: 'var(--md-sys-color-surface-container-high)',
        color: 'var(--md-sys-color-on-surface)',
        borderRadius: 'var(--md-sys-shape-corner-extra-large)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 22px',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}>
          <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 24, color: 'var(--md-sys-color-on-surface-variant)' }}>search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={onInput}
            onKeyDown={onKey}
            placeholder="Поиск объектов, заявок, журналов…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 16, color: 'var(--md-sys-color-on-surface)',
              fontFamily: 'inherit',
            }}
          />
          {loading && <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 18, color: 'var(--md-sys-color-on-surface-variant)' }}>hourglass</span>}
          <kbd style={{
            fontSize: 11, fontWeight: 600,
            color: 'var(--md-sys-color-on-surface-variant)',
            background: 'var(--md-sys-color-surface-container)',
            padding: '2px 8px', borderRadius: 4,
          }}>ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.map((r, i) => {
              const isActive = i === active
              let title = '', sub = '', extra = ''
              if (r.kind === 'object') {
                title = r.item.name ?? '—'
                sub   = r.item.address ?? ''
                extra = r.item.region ?? ''
              } else if (r.kind === 'ticket') {
                title = r.item.title
                sub   = r.item.ticket_number
                extra = r.item.priority
              } else if (r.kind === 'journal') {
                title = `Журнал #${r.item.journal_number ?? '—'}`
                sub   = r.item.result_description?.slice(0, 60) ?? ''
              }
              return (
                <div key={i} onClick={() => go(r)}
                  style={{
                    padding: '14px 22px', cursor: 'pointer',
                    background: isActive ? 'color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                  onMouseEnter={() => setActive(i)}>
                  <span style={{
                    width: 36, height: 36,
                    borderRadius: 'var(--md-sys-shape-corner-medium)',
                    background: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    display: 'grid', placeItems: 'center',
                    fontFamily: 'Material Symbols Rounded', fontSize: 20,
                    fontVariationSettings: "'FILL' 1, 'wght' 500",
                  }}>{KIND_ICON[r.kind]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--md-sys-color-on-surface)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                    {sub && <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    {r.kind === 'ticket' && extra && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[extra] ?? 'var(--md-sys-color-primary)' }}>{extra.toUpperCase()}</span>
                    )}
                    {r.kind === 'object' && extra && (
                      <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{extra}</span>
                    )}
                    <span className="md3-status-chip md3-status-chip--neutral">{KIND_LABEL[r.kind]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14 }}>
            Ничего не найдено по «{query}»
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--md-sys-color-outline-variant)',
          display: 'flex', gap: 18, fontSize: 11,
          color: 'var(--md-sys-color-on-surface-variant)',
        }}>
          <span>↑↓ выбор</span>
          <span>Enter перейти</span>
          <span>ESC закрыть</span>
          <span style={{ marginLeft: 'auto' }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
