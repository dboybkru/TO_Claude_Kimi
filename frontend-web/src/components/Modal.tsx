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
      style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, width, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px #0008' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e8f1fa' }}>{title}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, background: '#112030', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>

        {/* Footer */}
        {onConfirm && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', color: '#62b8f5', border: '1px solid #1a7dbd44', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Отмена</button>
            <button onClick={onConfirm} disabled={confirmLoading || confirmDisabled}
              style={{ padding: '8px 18px', borderRadius: 8, background: confirmLoading || confirmDisabled ? '#1a2e42' : danger ? '#c0392b' : 'var(--blue)', color: confirmLoading || confirmDisabled ? 'var(--text-4)' : '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: confirmLoading || confirmDisabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {confirmLoading ? 'Сохранение…' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
