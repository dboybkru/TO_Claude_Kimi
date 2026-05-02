import { useState } from 'react'
import { useApi } from '../api/useApi'
import { voiceApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { ROLE_LABELS } from '../utils/roles'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
        {title}
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, accent, mono }: { label: string; value: React.ReactNode; accent?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-inner)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: accent ?? 'var(--text-1)', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
      </span>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--red)', display: 'inline-block' }} />
      <span style={{ color: ok ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>{ok ? 'Подключено' : 'Не настроено'}</span>
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, background: copied ? 'var(--green-bg)' : 'var(--bg-input)', border: `1px solid ${copied ? '#1a4030' : 'var(--border-mid)'}`, color: copied ? 'var(--green)' : 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
      {copied ? '✓ Скопировано' : 'Копировать'}
    </button>
  )
}

export default function Settings() {
  const user = useAuthStore(s => s.user)
  const { data: voiceInfo, loading: voiceLoading } = useApi(() => voiceApi.info())

  const currentOrigin = window.location.origin
  // In dev Vite runs on :5173, API on :8000. In prod both on same origin.
  const apiBase = import.meta.env.DEV
    ? currentOrigin.replace(':5173', ':8000')
    : currentOrigin

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 720 }}>
      {/* Topbar breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 20 }}>
        <span style={{ color: '#4d7a9e' }}>Дашборд</span>
        <span style={{ color: '#2a4460', margin: '0 6px' }}>›</span>
        <span style={{ color: 'var(--text-1)' }}>Настройки системы</span>
      </div>

      {/* Profile */}
      <Section title="Профиль">
        <Row label="ФИО"    value={user?.full_name} />
        <Row label="Email"  value={user?.email} mono />
        <Row label="Роль"   value={ROLE_LABELS[user?.role ?? ''] ?? user?.role} accent="var(--purple)" />
        <Row label="Статус" value={user?.is_active ? 'Активен' : 'Заблокирован'} accent={user?.is_active ? 'var(--green)' : 'var(--red)'} />
      </Section>

      {/* Voice bot */}
      <Section title="Голосовой бот">
        {voiceLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Загрузка…</div>
        ) : voiceInfo ? (
          <>
            <Row label="Номер телефона"   value={voiceInfo.phone_number} accent="var(--blue)" />
            <Row label="Статус AI"        value={<StatusDot ok={voiceInfo.ai_configured} />} />
            <Row label="Webhook защищён"  value={<StatusDot ok={voiceInfo.webhook_secured} />} />
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 6 }}>Webhook URL (настройте в личном кабинете АТС):</div>
              <div style={{ background: '#091624', border: '1px solid #1a2e42', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#62b8f5', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center', wordBreak: 'break-all' }}>
                <span>{currentOrigin}/api/v1/voice/webhook</span>
                <CopyButton text={`${currentOrigin}/api/v1/voice/webhook`} />
              </div>
            </div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>Используемые AI модели:</div>
              {Object.entries(voiceInfo.models).map(([task, model]) => (
                <Row key={task} label={task} value={model} mono />
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Нет доступа к настройкам голосового бота</div>
        )}
      </Section>

      {/* System info */}
      <Section title="Система">
        <Row label="Версия API"      value="1.0.0" />
        <Row label="Frontend"        value={currentOrigin} mono />
        <Row label="API документация" value={
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer"
            style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 12 }}>
            Swagger UI →
          </a>
        } />
      </Section>

      {/* Quick links */}
      <Section title="Быстрые действия">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: '📋 Swagger / API docs', url: `${apiBase}/docs` },
            { label: '🔄 ReDoc', url: `${apiBase}/redoc` },
          ].map(link => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, background: '#0e2a42', border: '1px solid #1a3a5c', color: '#62b8f5', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </Section>
    </div>
  )
}
