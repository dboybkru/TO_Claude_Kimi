interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  hint?: string
}

export function FormField({ label, required, error, children, hint }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 13,
        color: error ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-on-surface-variant)',
        fontWeight: 500,
        fontFamily: 'var(--md-sys-typescale-font)',
      }}>
        {label}{required && <span style={{ color: 'var(--md-sys-color-error)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <span style={{
          fontSize: 12,
          color: 'var(--md-sys-color-on-surface-variant)',
          fontFamily: 'var(--md-sys-typescale-font)',
        }}>{hint}</span>
      )}
      {error && (
        <span style={{
          fontSize: 12,
          color: 'var(--md-sys-color-error)',
          fontFamily: 'var(--md-sys-typescale-font)',
        }}>{error}</span>
      )}
    </div>
  )
}

export const inputCss: React.CSSProperties = {
  width: '100%',
  background: 'var(--md-sys-color-surface-container-low)',
  border: '1px solid var(--md-sys-color-outline)',
  borderRadius: 'var(--md-sys-shape-corner-extra-small)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14,
  padding: '12px 14px',
  outline: 'none',
  fontFamily: 'var(--md-sys-typescale-font)',
  boxSizing: 'border-box',
  transition: 'border-color .15s, border-width .15s',
}

export const selectCss: React.CSSProperties = {
  ...inputCss, cursor: 'pointer',
}

export const textareaCss: React.CSSProperties = {
  ...inputCss,
  resize: 'vertical' as const,
  minHeight: 80,
  fontFamily: 'var(--md-sys-typescale-font)',
}
