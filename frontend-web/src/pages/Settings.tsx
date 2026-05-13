import { useState } from 'react'
import { useApi } from '../api/useApi'
import { voiceApi, api } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { ROLE_LABELS } from '../utils/roles'
import { Button, Input, message } from 'antd'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="md3-card" style={{ marginBottom: 16 }}>
      <div className="md3-card__header" style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <div className="md3-card__title" style={{
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.8px', textTransform: 'uppercase',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}>{title}</div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, accent, mono }: { label: string; value: React.ReactNode; accent?: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
      gap: 14,
    }}>
      <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      <span style={{
        fontSize: 13.5,
        color: accent ?? 'var(--md-sys-color-on-surface)',
        fontWeight: 500,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  const color = ok ? '#52C97E' : 'var(--md-sys-color-error)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {ok ? 'Подключено' : 'Не настроено'}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} className="md3-chip" style={{ marginLeft: 8, height: 28 }}>
      <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 16 }}>{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  )
}

export default function Settings() {
  const user = useAuthStore(s => s.user)
  const { data: voiceInfo, loading: voiceLoading } = useApi(() => voiceApi.info())

  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)

  const currentOrigin = window.location.origin
  const apiBase = import.meta.env.DEV
    ? currentOrigin.replace(':5173', ':8000')
    : currentOrigin

  return (
    <div className="md3-page" style={{ maxWidth: 760 }}>
      <nav aria-label="breadcrumbs" style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        <span style={{ cursor: 'pointer' }}>Дашборд</span>
        <span style={{ margin: '0 8px', color: 'var(--md-sys-color-outline)' }}>›</span>
        <span style={{ color: 'var(--md-sys-color-on-surface)', fontWeight: 500 }}>Настройки системы</span>
      </nav>

      <Section title="Профиль">
        <Row label="ФИО"    value={user?.full_name} />
        <Row label="Email"  value={user?.email} mono />
        <Row label="Роль"   value={ROLE_LABELS[user?.role ?? ''] ?? user?.role} accent="var(--purple)" />
        <Row label="Статус" value={user?.is_active ? 'Активен' : 'Заблокирован'} accent={user?.is_active ? 'var(--green)' : 'var(--red)'} />
      </Section>

      <Section title="Голосовой бот">
        {voiceLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Загрузка…</div>
        ) : voiceInfo ? (
          <>
            <Row label="Номер телефона" value={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  placeholder="+7..."
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  style={{ width: 200, background: '#0d1f30', borderColor: '#1a3a5c', color: '#e2e8f0' }}
                />
                <Button type="primary" size="small" loading={savingPhone}
                  onClick={async () => {
                    if (!phoneNumber.trim()) { message.error('Введите номер телефона'); return }
                    setSavingPhone(true)
                    try {
                      await api.put('/voice/phone-number', { phone_number: phoneNumber.trim() })
                      message.success('Номер сохранён')
                      setPhoneNumber('')
                      window.location.reload()
                    } catch (e: any) {
                      message.error(e.response?.data?.detail || 'Ошибка сохранения')
                    } finally {
                      setSavingPhone(false)
                    }
                  }}>
                  Сохранить
                </Button>
              </div>
            } />
            <Row label="Статус AI" value={<StatusDot ok={voiceInfo.ai_configured} />} />
            <Row label="Ключ VseGPT" value={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input.Password
                  placeholder="sk-... или gpt_..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ width: 320, background: '#0d1f30', borderColor: '#1a3a5c', color: '#e2e8f0' }}
                />
                <Button type="primary" size="small" loading={saving}
                  onClick={async () => {
                    if (!apiKey.trim()) { message.error('Введите API ключ'); return }
                    setSaving(true)
                    try {
                      await api.put('/voice/ai-key', { api_key: apiKey.trim() })
                      message.success('Ключ сохранён')
                      setApiKey('')
                      window.location.reload()
                    } catch (e: any) {
                      message.error(e.response?.data?.detail || 'Ошибка сохранения')
                    } finally {
                      setSaving(false)
                    }
                  }}>
                  Сохранить
                </Button>
              </div>
            } />
            <Row label="Webhook защищён" value={<StatusDot ok={voiceInfo.webhook_secured} />} />
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 8 }}>Webhook URL (настройте в личном кабинете АТС):</div>
              <div style={{
                background: 'var(--md-sys-color-surface-container-low)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
                padding: '10px 14px',
                fontSize: 12.5,
                color: 'var(--md-sys-color-primary)',
                fontFamily: 'ui-monospace, monospace',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                wordBreak: 'break-all', gap: 8,
              }}>
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

      <Section title="Система">
        <Row label="Версия API" value="1.0.0" />
        <Row label="Frontend" value={currentOrigin} mono />
        <Row label="API документация" value={
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 12 }}>
            Swagger UI →
          </a>
        } />
      </Section>

      <Section title="Быстрые действия">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer" className="md3-btn-tonal" style={{ textDecoration: 'none' }}>
            <span className="ic" aria-hidden>article</span>
            Swagger / API docs
          </a>
          <a href={`${apiBase}/redoc`} target="_blank" rel="noreferrer" className="md3-btn-tonal" style={{ textDecoration: 'none' }}>
            <span className="ic" aria-hidden>sync_alt</span>
            ReDoc
          </a>
        </div>
      </Section>
    </div>
  )
}
