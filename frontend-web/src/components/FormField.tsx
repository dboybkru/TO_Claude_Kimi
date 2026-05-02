interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  hint?: string
}

export function FormField({ label, required, error, children, hint }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: error ? 'var(--red)' : 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

export const inputCss: React.CSSProperties = {
  width: '100%', background: '#091624', border: '1px solid #1a2e42',
  borderRadius: 8, color: '#c5d8ea', fontSize: 13, padding: '9px 12px',
  outline: 'none', fontFamily: 'inherit',
}

export const selectCss: React.CSSProperties = {
  ...inputCss, cursor: 'pointer',
}

export const textareaCss: React.CSSProperties = {
  ...inputCss, resize: 'vertical' as const, minHeight: 80,
}
