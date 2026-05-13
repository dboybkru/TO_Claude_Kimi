import { useState, useRef, useEffect } from 'react'
import { voiceApi } from '../api/services'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export default function AIChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Здравствуйте! Я AI-ассистент SecureTO. Могу помочь с:\n• Подсказками по заявкам\n• Анализом журналов ТО\n• Поиском похожих случаев\n• Генерацией отчетов\n\nЧем могу помочь?',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // Try backend AI endpoint first
      const response = await voiceApi.journalAssist(userMsg.content)
      
      const assistantContent = response.result_description
        ? `**Анализ:**\n${response.result_description}\n\n**Статус системы:** ${response.system_status || 'N/A'}\n\n**Рекомендуемые действия:**\n${response.recommended_actions || 'N/A'}`
        : 'Извините, не удалось обработать запрос. Попробуйте переформулировать.'

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Ошибка соединения с AI-сервисом. Проверьте подключение к серверу.',
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Collapsed → MD3 FAB
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="AI Ассистент"
        aria-label="Открыть AI Ассистент"
        style={{
          position: 'fixed', right: 24, bottom: 24,
          width: 56, height: 56,
          background: 'var(--md-sys-color-primary-container)',
          color: 'var(--md-sys-color-on-primary-container)',
          border: 'none',
          borderRadius: 'var(--md-sys-shape-corner-large)',
          display: 'grid', placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          zIndex: 1000,
          fontFamily: 'Material Symbols Rounded',
          fontSize: 26,
          fontVariationSettings: "'FILL' 1, 'wght' 500",
          transition: 'filter .15s',
        }}
      >
        smart_toy
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24,
      width: 380, height: 540,
      background: 'var(--md-sys-color-surface-container-high)',
      color: 'var(--md-sys-color-on-surface)',
      borderRadius: 'var(--md-sys-shape-corner-extra-large)',
      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column',
      zIndex: 1000, overflow: 'hidden',
      fontFamily: 'var(--md-sys-typescale-font)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36,
            background: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
            borderRadius: 'var(--md-sys-shape-corner-medium)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'Material Symbols Rounded',
            fontSize: 22, fontVariationSettings: "'FILL' 1, 'wght' 500",
          }}>smart_toy</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>AI Ассистент</div>
            <div style={{ fontSize: 11, color: '#52c97e', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, background: '#52c97e', borderRadius: '50%' }} />
              Онлайн
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="md3-icon-btn" onClick={() => setMessages([messages[0]])} title="Очистить чат" aria-label="Очистить">
            <span className="ic" aria-hidden>delete_sweep</span>
          </button>
          <button className="md3-icon-btn" onClick={() => setIsOpen(false)} title="Свернуть" aria-label="Закрыть">
            <span className="ic" aria-hidden>close</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              padding: '10px 14px',
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: isUser ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-low)',
              color: isUser ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
              fontSize: 13.5, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{msg.content}</div>
          )
        })}
        {isLoading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '10px 14px',
            borderRadius: '16px 16px 16px 4px',
            background: 'var(--md-sys-color-surface-container-low)',
            color: 'var(--md-sys-color-on-surface-variant)',
            fontSize: 14,
            display: 'inline-flex', gap: 4,
          }}>
            <span style={{ animation: 'pulse 1s infinite' }}>●</span>
            <span style={{ animation: 'pulse 1s infinite 0.2s' }}>●</span>
            <span style={{ animation: 'pulse 1s infinite 0.4s' }}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 14px 14px',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        flexShrink: 0,
        borderTop: '1px solid var(--md-sys-color-outline-variant)',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение…"
          rows={1}
          style={{
            flex: 1,
            background: 'var(--md-sys-color-surface-container)',
            color: 'var(--md-sys-color-on-surface)',
            border: 'none',
            borderRadius: 'var(--md-sys-shape-corner-large)',
            padding: '10px 14px',
            fontSize: 14, lineHeight: '20px',
            fontFamily: 'inherit',
            resize: 'none', outline: 'none',
            minHeight: 40, maxHeight: 96,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          aria-label="Отправить"
          style={{
            width: 44, height: 44, flexShrink: 0,
            border: 'none',
            borderRadius: 'var(--md-sys-shape-corner-large)',
            background: input.trim() && !isLoading
              ? 'var(--md-sys-color-primary)'
              : 'color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent)',
            color: input.trim() && !isLoading
              ? 'var(--md-sys-color-on-primary)'
              : 'color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent)',
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            display: 'grid', placeItems: 'center',
            fontFamily: 'Material Symbols Rounded',
            fontSize: 22, fontVariationSettings: "'FILL' 1, 'wght' 500",
          }}
        >
          send
        </button>
      </div>
    </div>
  )
}
