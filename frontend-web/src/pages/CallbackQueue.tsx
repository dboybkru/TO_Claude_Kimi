import React, { useState, useEffect } from 'react'
import { Table, Tag, Button, Modal, Input, message, Spin, Image, Typography, Space, Card } from 'antd'
import api from '../api/client'
import { PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

interface CallbackItem {
  id: string
  caller_phone: string
  called_at: string
  call_recording_url: string | null
  transcript: string | null
  status: 'new' | 'resolved' | 'rejected'
  suggested_object_id: string | null
  suggested_address: string | null
}

export default function CallbackQueue() {
  const [items, setItems] = useState<CallbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<CallbackItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [transcribing, setTranscribing] = useState(false)

  const loadItems = async () => {
    setLoading(true)
    try {
      const response = await api.get('/tickets', { params: { source: 'voice_bot', status: 'new' } })
      const data = response.data.items?.filter((t: CallbackItem) => !t.suggested_object_id) || []
      setItems(data)
    } catch {
      message.error('Не удалось загрузить очередь перезвонов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [])

  const handleTranscribe = async (item: CallbackItem) => {
    if (!item.call_recording_url) {
      message.warning('Запись звонка недоступна')
      return
    }
    setTranscribing(true)
    try {
      const response = await api.post('/voice/transcribe', { audio_url: item.call_recording_url })
      const transcript = response.data.text
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, transcript } : i)),
      )
      message.success('Транскрипция получена')
    } catch {
      message.error('Ошибка транскрипции')
    } finally {
      setTranscribing(false)
    }
  }

  const handleResolve = async (itemId: string, action: 'create' | 'reject') => {
    try {
      if (action === 'create') {
        await api.patch(`/tickets/${itemId}`, {
          status: 'assigned',
          object_address: address,
        })
        message.success('Заявка создана')
      } else {
        await api.patch(`/tickets/${itemId}`, { status: 'closed' })
        message.success('Заявка отклонена')
      }
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      setIsModalOpen(false)
      setAddress('')
    } catch {
      message.error('Ошибка обработки заявки')
    }
  }

  const columns = [
    { title: 'Телефон', dataIndex: 'caller_phone', key: 'phone' },
    {
      title: 'Время',
      dataIndex: 'called_at',
      key: 'time',
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => (
        <Tag color={v === 'new' ? 'orange' : v === 'resolved' ? 'green' : 'red'}>
          {v === 'new' ? 'Новый' : v === 'resolved' ? 'Обработан' : 'Отклонён'}
        </Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: unknown, item: CallbackItem) => (
        <Space>
          {item.call_recording_url && (
            <Button
              icon={<PlayCircleOutlined />}
              onClick={() => window.open(item.call_recording_url!, '_blank')}
            >
              Аудио
            </Button>
          )}
          <Button onClick={() => handleTranscribe(item)} loading={transcribing}>
            Расшифровать
          </Button>
          <Button type="primary" onClick={() => { setSelectedItem(item); setIsModalOpen(true) }}>
            Обработать
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Очередь перезвонов</h2>
      {loading ? (
        <Spin size="large" />
      ) : (
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          locale={{ emptyText: 'Нет нераспознанных вызовов' }}
        />
      )}

      <Modal
        title="Обработка вызова"
        open={isModalOpen}
        onCancel={() => { setIsModalOpen(false); setAddress('') }}
        footer={null}
      >
        {selectedItem && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>Телефон: {selectedItem.caller_phone}</Text>
            {selectedItem.transcript && (
              <Card title="Расшифровка" size="small">
                {selectedItem.transcript}
              </Card>
            )}
            <Input.TextArea
              placeholder="Уточнённый адрес объекта"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
            />
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                type="primary"
                onClick={() => handleResolve(selectedItem.id, 'create')}
                disabled={!address.trim()}
              >
                Создать заявку
              </Button>
              <Button
                icon={<CloseCircleOutlined />}
                danger
                onClick={() => handleResolve(selectedItem.id, 'reject')}
              >
                Отклонить
              </Button>
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  )
}
