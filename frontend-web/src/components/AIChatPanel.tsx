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

  if (!isOpen) {
    return (
      <div
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          width: 56,
          height: 56,
          background: 'linear-gradient(135deg, #1a7dbd, #0e5a8a)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(26,125,189,0.4)',
          zIndex: 1000,
          fontSize: 24,
        }}
        title="AI Ассистент"
      >
        🤖
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 380,
        height: 520,
        background: 'rgba(13,29,44,0.92)',
        backdropFilter: 'blur(20px)',
        borderRadius: 16,
        border: '1px solid rgba(26,125,189,0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(26,125,189,0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(26,125,189,0.15), rgba(13,29,44,0.8))',
          borderBottom: '1px solid rgba(26,125,189,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #1a7dbd, #0e5a8a)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f1fa' }}>AI Ассистент</div>
            <div style={{ fontSize: 10, color: '#52c97e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, background: '#52c97e', borderRadius: '50%', display: 'inline-block' }} />
              Онлайн
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setMessages([messages[0]])}
            title="Очистить чат"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4d7a9e',
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            🗑
          </button>
          <button
            onClick={() => setIsOpen(false)}
            title="Свернуть"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4d7a9e',
              cursor: 'pointer',
              fontSize: 16,
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background:
                msg.role === 'user'
                  ? 'linear-gradient(135deg, #1a7dbd, #0e5a8a)'
                  : 'rgba(9,22,36,0.8)',
              border: msg.role === 'user' ? 'none' : '1px solid rgba(26,125,189,0.1)',
              color: '#c5d8ea',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: '14px 14px 14px 4px',
              background: 'rgba(9,22,36,0.8)',
              border: '1px solid rgba(26,125,189,0.1)',
              color: '#4d7a9e',
              fontSize: 13,
            }}
          >
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <span style={{ animation: 'pulse 1s infinite' }}>●</span>
              <span style={{ animation: 'pulse 1s infinite 0.2s' }}>●</span>
              <span style={{ animation: 'pulse 1s infinite 0.4s' }}>●</span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(26,125,189,0.15)',
          display: 'flex',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение..."
          rows={1}
          style={{
            flex: 1,
            background: 'rgba(9,22,36,0.8)',
            border: '1px solid rgba(26,125,189,0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#c5d8ea',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            minHeight: 20,
            maxHeight: 80,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{
            width: 40,
            height: 40,
            background: input.trim() && !isLoading
              ? 'linear-gradient(135deg, #1a7dbd, #0e5a8a)'
              : 'rgba(26,125,189,0.2)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            cursor: input.trim() && !isLoading ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  )
}
