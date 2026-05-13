import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  confirmLoading?: boolean
  confirmDisabled?: boolean
  width?: number
  children: React.ReactNode
  danger?: boolean
}

export default function Modal({
  open, title, onClose, onConfirm, confirmLabel = 'Сохранить',
  confirmLoading, confirmDisabled, width = 480, children, danger,
}: ModalProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--md-sys-typescale-font)',
      }}
    >
      <div style={{
        background: 'var(--md-sys-color-surface-container-high)',
        color: 'var(--md-sys-color-on-surface)',
        borderRadius: 'var(--md-sys-shape-corner-extra-large)',
        width, maxWidth: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 12px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexShrink: 0,
        }}>
          <span style={{
            fontSize: 22, fontWeight: 500, lineHeight: '28px',
            color: 'var(--md-sys-color-on-surface)',
          }}>{title}</span>
          <button onClick={onClose} className="md3-icon-btn" aria-label="Закрыть">
            <span className="ic" aria-hidden>close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '8px 24px 20px',
          color: 'var(--md-sys-color-on-surface-variant)',
          fontSize: 14, lineHeight: 1.5,
        }}>
          {children}
        </div>

        {/* Footer */}
        {onConfirm && (
          <div style={{
            padding: '12px 24px 20px',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            <button onClick={onClose} style={{
              height: 40, padding: '0 18px',
              borderRadius: 9999,
              background: 'transparent',
              color: 'var(--md-sys-color-primary)',
              border: 'none',
              font: '600 14px/20px var(--md-sys-typescale-font)',
              cursor: 'pointer',
            }}>Отмена</button>
            <button onClick={onConfirm} disabled={confirmLoading || confirmDisabled}
              style={{
                height: 40, padding: '0 22px',
                borderRadius: 9999,
                background: confirmLoading || confirmDisabled
                  ? 'color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent)'
                  : danger ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)',
                color: confirmLoading || confirmDisabled
                  ? 'color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent)'
                  : danger ? '#fff' : 'var(--md-sys-color-on-primary)',
                border: 'none',
                font: '600 14px/20px var(--md-sys-typescale-font)',
                cursor: confirmLoading || confirmDisabled ? 'not-allowed' : 'pointer',
              }}>
              {confirmLoading ? 'Сохранение…' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
