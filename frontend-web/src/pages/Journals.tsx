import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Image } from 'antd'
import { useApi, useMutation } from '../api/useApi'
import { journalsApi, objectsApi, usersApi, voiceApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { getAccess } from '../utils/roles'
import { compressImage, readFileAsBase64 } from '../utils/imageCompression'
import type { MaintenanceJournal, MaintenanceJournalCreate, ObjectItem, User } from '../api/types'
import Modal from '../components/Modal'
import SignatureCanvas from '../components/SignatureCanvas'
import { FormField, inputCss, selectCss, textareaCss } from '../components/FormField'
import {
  printObjectJournal,
  printBlankJournals,
  printSummaryJournal,
  type JournalEntry,
  type SummaryEntry,
} from '../utils/printForms'

const STATUS_LABELS: Record<string, string> = { operational: 'Работоспособна', repaired: 'Отремонтирована', needs_repair: 'Требует ремонта' }
const STATUS_CHIP: Record<string, string>   = { operational: 'chip-green', repaired: 'chip-blue', needs_repair: 'chip-red' }

// ── Checklists (Регламент №1 из ТЗ) ──────────────────────────────────────────
const CHECKLIST_OS: string[] = [
  'Внешний осмотр ПКП на отсутствие механических повреждений и загрязнений',
  'Разборка корпуса ПКП, внутренний осмотр, удаление пыли',
  'Протирка спиртовым раствором коммутационных разъёмов ПКП',
  'Проверка режима программирования и правильности программных настроек',
  'Проверка работы ПКП без основного питания (от АКБ)',
  'Проверка и измерение параметров блока резервного питания (БРП/РИП)',
  'Проверка аккумуляторов, измерение напряжения',
  'Внешний осмотр пульта управления С2000-М, проверка работы в различных режимах',
  'Проверка инфракрасных датчиков (внешний осмотр, очистка, проверка работы)',
  'Проверка магнитоконтактных извещателей (осмотр, очистка, проверка)',
  'Проверка кабельных линий ДПЛС и шлейфов сигнализации',
  'Тест связи с пультом централизованного наблюдения (ПЦН)',
  'Проверка работы тревожной кнопки (ОТС)',
  'Проверка наличия сети передачи данных, связи с сервером',
  'Архивирование событий, снятие архивных данных по сбоям',
  'Запись в журнал ТО результатов выполненных работ',
]

const CHECKLIST_SKUD: string[] = [
  'Обслуживание АРМ СКУД: внешний осмотр, очистка от пыли (внутренний объём, контакты, платы)',
  'Чистка контактов и разъёмов АРМ, смазка механических элементов',
  'Настройка и поддержка системного и специального ПО СКУД',
  'Тестирование, дефрагментация диска, освобождение места на жёстком диске',
  'Проверка операционной системы АРМ, архивирование событий',
  'Обслуживание сервера ПАК «БОЛИД»: внешний осмотр, очистка, чистка разъёмов',
  'Проверка работы СУБД сервера, корректировка базы данных',
  'Внешний осмотр контроллера СКУД: повреждения, загрязнения, коррозия',
  'Проверка питания контроллера (входного, выходного каскадов)',
  'Проверка сетевых настроек контроллера, наличия связи с сервером',
  'Проверка управления контроллером, режима программирования',
  'Проверка работы контроллера без основного питания (резервное питание)',
  'Внешний осмотр считывателя КМСД: повреждения, загрязнения',
  'Проверка питания считывателя, наличия связи с контроллером',
  'Проверка управления считывателем, сенсора стеклянной призмы',
  'Проверка связи с ЛВС, тест доступа по карте/браслету',
  'Чистка архива журнала событий СКУД',
]

const CHECKLIST_OS_SKUD = [...CHECKLIST_OS, ...CHECKLIST_SKUD]

function getChecklistForType(type?: string): string[] {
  if (type === 'SKUD')    return CHECKLIST_SKUD
  if (type === 'SKUD_OS') return CHECKLIST_OS_SKUD
  return CHECKLIST_OS
}

const FINAL_STATEMENT = 'Система(ы) сдана(ы) Заказчику в работоспособном состоянии в дальнейшую эксплуатацию'

// ── PDF print ─────────────────────────────────────────────────────────────────
function printJournal(j: MaintenanceJournal, objName: string, techName: string) {
  const checkedCount = (j.checklist ?? []).filter(c => c.done).length
  const rows = (j.checklist ?? []).map(c =>
    `<tr><td style="padding:4px 8px">${c.text}</td><td style="text-align:center">${c.done ? '✓' : ''}</td></tr>`
  ).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Журнал ТО №${j.journal_number ?? j.id.slice(0,8)}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#000}h2{margin:0 0 6px}p{margin:4px 0;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px}
th{background:#f0f0f0}.sig{margin-top:32px;display:flex;gap:60px}.sig div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:11px}</style>
</head><body>
<h2>Акт технического обслуживания № ${j.journal_number ?? '—'}</h2>
<p><b>Объект:</b> ${objName}</p>
<p><b>Техник:</b> ${techName}</p>
<p><b>Прибытие:</b> ${j.arrived_at ? new Date(j.arrived_at).toLocaleString('ru-RU') : '—'}</p>
<p><b>Завершение:</b> ${j.completed_at ? new Date(j.completed_at).toLocaleString('ru-RU') : 'В процессе'}</p>
<p><b>Представитель заказчика:</b> ${j.customer_rep_name ?? '—'}</p>
<p><b>Состояние системы:</b> ${{ operational: 'Работоспособна', repaired: 'Отремонтирована', needs_repair: 'Требует ремонта' }[j.system_status ?? 'operational'] ?? '—'}</p>
<table><thead><tr><th>Пункт проверки (Регламент №1)</th><th style="width:80px">Выполнено</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td><b>Итого выполнено: ${checkedCount} из ${(j.checklist ?? []).length}</b></td><td></td></tr></tfoot></table>
${j.result_description ? `<p style="margin-top:12px"><b>Описание работ:</b> ${j.result_description}</p>` : ''}
${j.system_status === 'operational' ? `<p style="margin-top:8px;color:green">✓ ${j.final_statement ?? FINAL_STATEMENT}</p>` : ''}
<div class="sig">
  <div>Подпись техника<br><br>${techName}</div>
  <div>Подпись заказчика<br><br>${j.customer_rep_name ?? '_______________'}</div>
</div></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 400)
}

// ── Signature block helper ────────────────────────────────────────────────────
function SignatureBlock({
  label,
  signature,
  onOpen,
  onClear,
}: {
  label: string
  signature?: string | null
  onOpen: () => void
  onClear?: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {signature && onClear && (
            <button onClick={onClear} style={{ fontSize: 11, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              Очистить
            </button>
          )}
          <button onClick={onOpen} style={{ fontSize: 11, color: '#62b8f5', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            {signature ? 'Изменить' : 'Добавить'}
          </button>
        </div>
      </div>
      {signature ? (
        <img src={signature} alt={label} width={100} style={{ borderRadius: 6, border: '1px solid var(--border-mid)', background: '#0b1825' }} />
      ) : (
        <div style={{ width: 100, height: 60, borderRadius: 6, border: '1px dashed var(--border-mid)', background: '#0b1825', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 11 }}>
          Нет подписи
        </div>
      )}
    </div>
  )
}

// ── Photo upload block helper ─────────────────────────────────────────────────
function PhotoUploadBlock({
  photos,
  onChange,
  disabled,
}: {
  photos: string[]
  onChange: (photos: string[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const compressedBlobs = await Promise.all(Array.from(files).map(f => compressImage(f, 1200, 0.8)))
      const base64s = await Promise.all(compressedBlobs.map(b => readFileAsBase64(new File([b], 'photo.jpg', { type: 'image/jpeg' }))))
      onChange([...photos, ...base64s])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Фотографии</span>
        <label style={{ fontSize: 11, color: '#62b8f5', cursor: disabled || uploading ? 'not-allowed' : 'pointer', opacity: disabled || uploading ? 0.5 : 1 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFiles}
            disabled={disabled || uploading}
          />
          📎 {uploading ? 'Обработка…' : 'Добавить фото'}
        </label>
      </div>
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {photos.map((url, i) => (
            <div key={i} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-mid)', aspectRatio: '1' }}>
              <img src={url} alt={`Фото ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
                style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: '#000a', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Edit Journal Modal ────────────────────────────────────────────────────────
function EditJournalModal({ journal, open, onClose, onSaved, objectId }: { journal: MaintenanceJournal | null; open: boolean; onClose: () => void; onSaved: () => void; objectId?: string }) {
  const [form, setForm] = useState({ system_status: '', result_description: '', customer_rep_name: '', final_statement: '', completed_at: '' })
  const [freeText, setFreeText]     = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiApplied, setAiApplied]   = useState(false)
  const [techSig, setTechSig]       = useState<string | null>(null)
  const [custSig, setCustSig]       = useState<string | null>(null)
  const [photos, setPhotos]         = useState<string[]>([])
  const [sigModal, setSigModal]     = useState<'tech' | 'customer' | null>(null)
  const { mutate, loading, error } = useMutation(({ id, data }: { id: string; data: object }) => journalsApi.update(id, data as Partial<MaintenanceJournal>))

  async function applyAiAssist() {
    if (!freeText.trim()) return
    setAiLoading(true)
    try {
      const res = await voiceApi.journalAssist(freeText, objectId)
      if (res.result_description) setForm(p => ({ ...p, result_description: res.result_description! }))
      if (res.system_status)      setForm(p => ({ ...p, system_status: res.system_status! }))
      if (res.final_statement)    setForm(p => ({ ...p, final_statement: res.final_statement! }))
      setAiApplied(true)
    } finally { setAiLoading(false) }
  }

  useEffect(() => {
    if (journal) {
      setForm({
        system_status: journal.system_status ?? 'operational',
        result_description: journal.result_description ?? '',
        customer_rep_name: journal.customer_rep_name ?? '',
        final_statement: journal.final_statement ?? '',
        completed_at: journal.completed_at ? journal.completed_at.slice(0, 16) : '',
      })
      setTechSig(journal.technician_signature ?? null)
      setCustSig(journal.customer_signature ?? null)
      setPhotos(journal.photos ?? [])
    }
  }, [journal?.id])

  if (!journal) return null
  const jid = journal.id

  async function submit() {
    const payload: Record<string, unknown> = {
      system_status: form.system_status,
      result_description: form.result_description || undefined,
      customer_rep_name: form.customer_rep_name || undefined,
      final_statement: form.final_statement || undefined,
      technician_signature: techSig || undefined,
      customer_signature: custSig || undefined,
      photos: photos.length ? photos : undefined,
    }
    if (form.completed_at) payload.completed_at = new Date(form.completed_at).toISOString()
    const result = await mutate({ id: jid, data: payload })
    if (result) { onSaved(); onClose() }
  }

  return (
    <>
      <Modal open={open} title={`Журнал № ${journal.journal_number ?? '—'}`} onClose={onClose} onConfirm={submit} confirmLoading={loading} width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}

          {/* AI Journal Assistant */}
          <div style={{ background: '#091624', border: '1px solid #1a3a5c', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#62b8f5', marginBottom: 8 }}>🤖 AI Помощник монтажника</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 6 }}>
              Опишите выполненные работы своими словами — AI заполнит поля журнала:
            </div>
            <textarea
              value={freeText}
              onChange={e => { setFreeText(e.target.value); setAiApplied(false) }}
              placeholder="Напр.: заменил АКБ в БРП-12, проверил все датчики ИК в зоне А, перепрограммировал ПКП С2000-М, протестировал связь с ПЦН — всё работает"
              style={{ ...textareaCss, minHeight: 70, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button disabled={!freeText.trim() || aiLoading} onClick={applyAiAssist}
                style={{ padding: '7px 14px', borderRadius: 7, background: !freeText.trim() || aiLoading ? '#1a2e42' : '#0a1f30', color: !freeText.trim() || aiLoading ? 'var(--text-4)' : '#62b8f5', border: '1px solid #1a3a5c', fontSize: 12, fontWeight: 600, cursor: !freeText.trim() || aiLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {aiLoading ? '🤖 Заполняю…' : '🤖 Заполнить поля'}
              </button>
              {aiApplied && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Поля заполнены — проверьте и сохраните</span>}
            </div>
          </div>

          <FormField label="Состояние системы">
            <select style={selectCss} value={form.system_status} onChange={e => setForm(p => ({ ...p, system_status: e.target.value }))}>
              <option value="operational"  style={{ background: '#0d1d2c' }}>Работоспособна</option>
              <option value="repaired"     style={{ background: '#0d1d2c' }}>Отремонтирована</option>
              <option value="needs_repair" style={{ background: '#0d1d2c' }}>Требует ремонта</option>
            </select>
          </FormField>
          <FormField label="Дата и время завершения ТО">
            <input type="datetime-local" style={inputCss} value={form.completed_at} onChange={e => setForm(p => ({ ...p, completed_at: e.target.value }))} />
          </FormField>
          <FormField label="Описание выполненных работ">
            <textarea style={textareaCss} value={form.result_description} onChange={e => setForm(p => ({ ...p, result_description: e.target.value }))} placeholder="Что было проверено и выполнено…" />
          </FormField>
          <FormField label="ФИО представителя заказчика">
            <input style={inputCss} value={form.customer_rep_name} onChange={e => setForm(p => ({ ...p, customer_rep_name: e.target.value }))} placeholder="Иванов И.И." />
          </FormField>
          <FormField label="Итоговое заключение">
            <input style={inputCss} value={form.final_statement} onChange={e => setForm(p => ({ ...p, final_statement: e.target.value }))} placeholder={FINAL_STATEMENT} />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SignatureBlock label="Подпись техника" signature={techSig} onOpen={() => setSigModal('tech')} onClear={() => setTechSig(null)} />
            <SignatureBlock label="Подпись заказчика" signature={custSig} onOpen={() => setSigModal('customer')} onClear={() => setCustSig(null)} />
          </div>

          <PhotoUploadBlock photos={photos} onChange={setPhotos} />
        </div>
      </Modal>

      <Modal open={!!sigModal} title={sigModal === 'tech' ? 'Подпись техника' : 'Подпись заказчика'} onClose={() => setSigModal(null)} width={460}>
        <SignatureCanvas
          onSave={(base64) => {
            if (sigModal === 'tech') setTechSig(base64)
            else setCustSig(base64)
            setSigModal(null)
          }}
          onCancel={() => setSigModal(null)}
          width={420}
          height={180}
        />
      </Modal>
    </>
  )
}

// ── Create Journal Modal ──────────────────────────────────────────────────────
function CreateJournalModal({ open, onClose, onCreated, initialObjectId, objects }: {
  open: boolean; onClose: () => void; onCreated: () => void; initialObjectId?: string; objects: ObjectItem[]
}) {
  const user = useAuthStore(s => s.user)
  const [objectId, setObjectId] = useState(initialObjectId ?? '')
  const [checklist, setChecklist] = useState<Record<number, boolean>>({})
  const [resultDesc, setResultDesc] = useState('')
  const [systemStatus, setSystemStatus] = useState('operational')
  const [customerRep, setCustomerRep] = useState('')
  const [techSig, setTechSig]       = useState<string | null>(null)
  const [custSig, setCustSig]       = useState<string | null>(null)
  const [photos, setPhotos]         = useState<string[]>([])
  const [sigModal, setSigModal]     = useState<'tech' | 'customer' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, loading, error } = useMutation((d: MaintenanceJournalCreate) => journalsApi.create(d))

  useEffect(() => {
    if (open && initialObjectId) setObjectId(initialObjectId)
    setChecklist({})
    setTechSig(null)
    setCustSig(null)
    setPhotos([])
  }, [open, initialObjectId])

  const selectedObj  = objects.find(o => o.id === objectId)
  const checklistItems = getChecklistForType(selectedObj?.type)
  const typeLabel    = selectedObj ? ({ OS: 'ОС', OTS: 'ОТС', OS_OTS: 'ОС/ОТС', SKUD: 'СКУД', SKUD_OS: 'СКУД+ОС' } as Record<string,string>)[selectedObj.type] ?? '' : ''

  function toggleCheck(i: number) { setChecklist(p => ({ ...p, [i]: !p[i] })) }

  async function submit() {
    const e: Record<string, string> = {}
    if (!objectId) e.object = 'Выберите объект'
    setErrors(e)
    if (Object.keys(e).length) return
    const checklistArr = checklistItems.map((text, i) => ({ id: i, text, done: !!checklist[i] }))
    const result = await mutate({
      object_id: objectId,
      technician_id: user!.id,
      arrived_at: new Date().toISOString(),
      checklist: checklistArr,
      result_description: resultDesc || undefined,
      system_status: systemStatus as MaintenanceJournalCreate['system_status'],
      customer_rep_name: customerRep || undefined,
      photos: photos.length ? photos : undefined,
      technician_signature: techSig || undefined,
      customer_signature: custSig || undefined,
    })
    if (result) { setObjectId(initialObjectId ?? ''); setChecklist({}); setResultDesc(''); setTechSig(null); setCustSig(null); setPhotos([]); onCreated(); onClose() }
  }

  const doneCount = Object.values(checklist).filter(Boolean).length

  return (
    <>
      <Modal open={open} title="Создать журнал ТО" onClose={onClose} onConfirm={submit} confirmLoading={loading} width={580}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}

          <FormField label="Объект" required error={errors.object}>
            <select style={selectCss} value={objectId} onChange={e => { setObjectId(e.target.value); setChecklist({}) }}>
              <option value="" style={{ background: '#0d1d2c' }}>— Выбрать объект —</option>
              {objects.map(o => <option key={o.id} value={o.id} style={{ background: '#0d1d2c' }}>{o.name}</option>)}
            </select>
          </FormField>

          <FormField label={`Регламент №1${typeLabel ? ` (${typeLabel})` : ''} — ${doneCount}/${checklistItems.length} выполнено`}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {checklistItems.map((item, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '3px 0' }}>
                  <input type="checkbox" checked={!!checklist[i]} onChange={() => toggleCheck(i)}
                    style={{ width: 14, height: 14, accentColor: 'var(--blue)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: checklist[i] ? 'var(--green)' : 'var(--text-2)', lineHeight: 1.4 }}>{item}</span>
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Состояние системы">
            <select style={selectCss} value={systemStatus} onChange={e => setSystemStatus(e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#0d1d2c' }}>{l}</option>)}
            </select>
          </FormField>

          <FormField label="Описание выполненных работ">
            <textarea style={textareaCss} value={resultDesc} onChange={e => setResultDesc(e.target.value)} placeholder="Что было проверено и выполнено…" />
          </FormField>

          <FormField label="ФИО представителя заказчика">
            <input style={inputCss} value={customerRep} onChange={e => setCustomerRep(e.target.value)} placeholder="Иванов И.И." />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SignatureBlock label="Подпись техника" signature={techSig} onOpen={() => setSigModal('tech')} onClear={() => setTechSig(null)} />
            <SignatureBlock label="Подпись заказчика" signature={custSig} onOpen={() => setSigModal('customer')} onClear={() => setCustSig(null)} />
          </div>

          <PhotoUploadBlock photos={photos} onChange={setPhotos} />
        </div>
      </Modal>

      <Modal open={!!sigModal} title={sigModal === 'tech' ? 'Подпись техника' : 'Подпись заказчика'} onClose={() => setSigModal(null)} width={460}>
        <SignatureCanvas
          onSave={(base64) => {
            if (sigModal === 'tech') setTechSig(base64)
            else setCustSig(base64)
            setSigModal(null)
          }}
          onCancel={() => setSigModal(null)}
          width={420}
          height={180}
        />
      </Modal>
    </>
  )
}

// ── AI Summary Button ─────────────────────────────────────────────────────────
function AiSummaryButton({ journalId, existingSummary }: { journalId: string; existingSummary: string | null }) {
  const [summary, setSummary] = useState(existingSummary)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [expanded, setExpanded] = useState(false)

  async function generate() {
    setLoading(true); setError('')
    try {
      const res = await voiceApi.summarizeJournal(journalId)
      setSummary(res.summary)
      setExpanded(true)
    } catch {
      setError('Не удалось сгенерировать резюме. Проверьте AI настройки.')
    } finally {
      setLoading(false)
    }
  }

  if (summary && !loading) return (
    <div>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', background: '#0a1f10', border: '1px solid #1a4020', borderRadius: 8, marginBottom: expanded ? 0 : 0 }}>
        <span style={{ fontSize: 13 }}>🤖</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>AI Резюме</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ background: '#0a1f10', border: '1px solid #1a4020', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '10px 12px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {summary}
          <div style={{ marginTop: 8 }}>
            <span onClick={generate} style={{ fontSize: 11, color: '#4d7a9e', cursor: 'pointer' }}>↻ Обновить</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <button disabled={loading} onClick={generate}
        style={{ width: '100%', padding: 10, borderRadius: 8, background: loading ? '#1a2e42' : '#0a1f30', color: loading ? 'var(--text-4)' : '#62b8f5', border: '1px solid #1a3a5c', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span>🤖</span>{loading ? 'AI генерирует резюме…' : 'AI Резюме журнала'}
      </button>
      {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Journals Page ─────────────────────────────────────────────────────────────
export default function Journals() {
  const access   = getAccess(useAuthStore(s => s.user?.role))
  const location = useLocation()
  const [selected, setSelected] = useState<MaintenanceJournal | null>(null)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [createOpen, setCreate] = useState(false)
  const [createForObjectId, setCreateForObjectId] = useState<string | undefined>()
  const [editTarget, setEdit]   = useState<MaintenanceJournal | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const { data, loading, error, refetch } = useApi(() => journalsApi.list({ size: 100, system_status: filterStatus !== 'all' ? filterStatus : undefined }), [filterStatus])
  const { data: objectsData } = useApi(() => objectsApi.list({ size: 200 }))
  const { data: usersData }   = useApi(() => usersApi.list())

  const { mutate: completeJournal, loading: completing } = useMutation(
    (id: string) => journalsApi.update(id, { completed_at: new Date().toISOString() } as Partial<MaintenanceJournal>)
  )

  const objectMap = useMemo<Record<string, ObjectItem>>(() => {
    const m: Record<string, ObjectItem> = {}
    objectsData?.items.forEach(o => { m[o.id] = o })
    return m
  }, [objectsData])

  const userMap = useMemo<Record<string, User>>(() => {
    const m: Record<string, User> = {}
    usersData?.forEach(u => { m[u.id] = u })
    return m
  }, [usersData])

  useEffect(() => {
    const state = location.state as { createJournalForObject?: string } | null
    if (state?.createJournalForObject) {
      setCreateForObjectId(state.createJournalForObject)
      setCreate(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Печать Журнала ТО по объекту (Приложение №2 к ТЗ) — все записи выбранного объекта
  const handlePrintObjectJournal = useCallback((j: MaintenanceJournal) => {
    const obj = objectMap[j.object_id]
    if (!obj) return
    // Берём все записи для этого объекта из текущей загруженной страницы
    const objectEntries = (data?.items ?? [])
      .filter(x => x.object_id === j.object_id)
      .sort((a, b) => (a.journal_number ?? 0) - (b.journal_number ?? 0))
    const entries: JournalEntry[] = objectEntries.map((e, i) => ({
      num: i + 1,
      journal_number: e.journal_number ?? null,
      arrived_at: e.arrived_at ?? null,
      completed_at: e.completed_at ?? null,
      system_type: (e as MaintenanceJournal & { system_type?: string }).system_type ?? '',
      result_description: e.result_description ?? '',
      final_statement: e.final_statement ?? '',
      technician_name: userMap[e.technician_id]?.full_name ?? userMap[e.technician_id]?.email ?? '',
      technician_signature: e.technician_signature ?? '',
      customer_rep_name: e.customer_rep_name ?? '',
      customer_signature: e.customer_signature ?? '',
    }))
    printObjectJournal(
      { id: obj.id, name: obj.name, address: obj.address, type: obj.type },
      entries,
    )
  }, [data, objectMap, userMap])

  // Печать Сводного журнала (Приложение №4 к ТЗ) — получаем с сервера все завершённые записи
  const handlePrintSummaryJournal = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const raw = await journalsApi.getSummary()
      const entries: SummaryEntry[] = (raw as Record<string, unknown>[]).map((r, i) => ({
        num: (r.num as number) ?? i + 1,
        journal_number: r.journal_number as number | null,
        completed_at: r.completed_at as string | null,
        arrived_at: r.arrived_at as string | null,
        object_name: r.object_name as string,
        object_address: r.object_address as string,
        system_type: r.system_type as string,
        result_description: r.result_description as string,
        final_statement: r.final_statement as string,
        technician_name: r.technician_name as string,
        technician_signature: r.technician_signature as string,
        customer_rep_name: r.customer_rep_name as string,
        customer_signature: r.customer_signature as string,
      }))
      printSummaryJournal(entries)
    } catch (e) {
      console.error('Ошибка загрузки сводного журнала:', e)
      alert('Не удалось загрузить данные сводного журнала')
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  // Печать пустых бланков для объектов (для физической раздачи на объекты)
  const handlePrintBlankJournals = useCallback(() => {
    const objs = (objectsData?.items ?? []).map(o => ({
      id: o.id, name: o.name, address: o.address, type: o.type,
    }))
    if (objs.length === 0) {
      alert('Объекты не загружены')
      return
    }
    if (objs.length > 30 && !confirm(`Будет открыто ${objs.length} страниц (по одной на объект). Продолжить?`)) return
    printBlankJournals(objs)
  }, [objectsData])

  const items = data?.items ?? []
  const filtered = items.filter(j => {
    if (!search) return true
    const q = search.toLowerCase()
    const objName  = objectMap[j.object_id]?.name?.toLowerCase() ?? ''
    const techName = userMap[j.technician_id]?.full_name?.toLowerCase() ?? ''
    return j.id.toLowerCase().includes(q) || objName.includes(q) || techName.includes(q) || String(j.journal_number ?? '').includes(q)
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
          <span style={{ color: '#4d7a9e' }}>Дашборд</span><span style={{ color: '#2a4460', margin: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text-1)' }}>Журналы ТО</span>
        </span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Загрузка…</span>}
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} записей</span>
        <button className="topbar-btn" title="Пустые бланки для 313 объектов (Приложение №2)" onClick={handlePrintBlankJournals}
          style={{ fontSize: 11 }}>🖨 Бланки</button>
        <button className="topbar-btn" title="Сводный журнал (Приложение №4 к ТЗ)" disabled={summaryLoading} onClick={handlePrintSummaryJournal}
          style={{ fontSize: 11 }}>{summaryLoading ? 'Загрузка…' : '📋 Сводный журнал'}</button>
        {access.canCreateJournal && <button className="topbar-btn btn-primary" onClick={() => setCreate(true)}>+ Создать журнал</button>}
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', background: '#0b1825', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2d4a62', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input className="filter-input" style={{ paddingLeft: 32, width: 260 }} placeholder="Поиск по объекту, технику, №…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 7, color: '#8aacbf', fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}>
          <option value="all">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: 'var(--bg-panel)' }}>{l}</option>)}
        </select>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {error !== 'backend_down' && filtered.length === 0 && !loading && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📋</div>
                <div>Журналов нет. Нажмите «+ Создать журнал»</div>
              </div>
            )}
            {filtered.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['№ журнала', 'Объект', 'Техник', 'Прибыл', 'Завершено', 'Состояние системы', ''].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', position: 'sticky', top: 0, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => {
                    const s = j.system_status ?? 'operational'
                    return (
                      <tr key={j.id} onClick={() => setSelected(j === selected ? null : j)} style={{ cursor: 'pointer', background: selected?.id === j.id ? '#0c2035' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', fontFamily: 'monospace', fontSize: 11, color: '#62b8f5' }}>#{j.journal_number ?? '—'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-1)', fontWeight: 500, maxWidth: 180 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{objectMap[j.object_id]?.name ?? j.object_id.slice(0, 8) + '…'}</div>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-2)' }}>{userMap[j.technician_id]?.full_name ?? j.technician_id.slice(0, 8) + '…'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {j.arrived_at ? new Date(j.arrived_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)', whiteSpace: 'nowrap' }}>
                          {j.completed_at
                            ? <span style={{ color: 'var(--green)', fontSize: 11 }}>{new Date(j.completed_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            : <span className="chip chip-orange">В процессе</span>}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                          <span className={`chip ${STATUS_CHIP[s]}`}>{STATUS_LABELS[s]}</span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-inner)' }}>
                          <button onClick={e => { e.stopPropagation(); handlePrintObjectJournal(j) }}
                            title="Журнал ТО объекта (Приложение №2 к ТЗ)"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-mid)', borderRadius: 6, color: '#62b8f5', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>📄 Журнал</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <div style={{ width: 380, minWidth: 340, display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginBottom: 3 }}>
                  Журнал № {selected.journal_number ?? '—'} · {objectMap[selected.object_id]?.type ?? ''}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f1fa' }}>{objectMap[selected.object_id]?.name ?? 'Запись ТО'}</div>
              </div>
              <div onClick={() => setSelected(null)} style={{ width: 26, height: 26, background: '#112030', border: '1px solid #1e3347', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>✕</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Данные визита</div>
                {([
                  ['Прибытие', selected.arrived_at ? new Date(selected.arrived_at).toLocaleString('ru-RU') : '—'],
                  ['Завершение', selected.completed_at ? new Date(selected.completed_at).toLocaleString('ru-RU') : 'В процессе'],
                  ['Состояние', STATUS_LABELS[selected.system_status ?? 'operational']],
                  ['Подписант', selected.customer_rep_name ?? '—'],
                  ['Техник', userMap[selected.technician_id]?.full_name ?? '—'],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-inner)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</span>
                    <span style={{ fontSize: 12, color: '#b0cde0', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Signatures */}
              {(selected.technician_signature || selected.customer_signature) && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Подписи</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {selected.technician_signature && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 4 }}>Техник</div>
                        <img src={selected.technician_signature} alt="Подпись техника" width={100} style={{ borderRadius: 6, border: '1px solid var(--border-mid)', background: '#0b1825' }} />
                      </div>
                    )}
                    {selected.customer_signature && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 4 }}>Заказчик</div>
                        <img src={selected.customer_signature} alt="Подпись заказчика" width={100} style={{ borderRadius: 6, border: '1px solid var(--border-mid)', background: '#0b1825' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photos */}
              {selected.photos && selected.photos.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Фотографии ({selected.photos.length})</div>
                  <Image.PreviewGroup>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {selected.photos.map((url, i) => (
                        <Image key={i} src={url} alt={`Фото ${i + 1}`} width="100%" style={{ borderRadius: 6, objectFit: 'cover', aspectRatio: '1' }} />
                      ))}
                    </div>
                  </Image.PreviewGroup>
                </div>
              )}

              {selected.checklist && selected.checklist.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                    Регламент №1 ({selected.checklist.filter(c => c.done).length}/{selected.checklist.length})
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {selected.checklist.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0', fontSize: 11, color: item.done ? 'var(--green)' : 'var(--text-3)', lineHeight: 1.4 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}>{item.done ? '✓' : '○'}</span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.result_description && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {selected.result_description}
                </div>
              )}

              {selected.system_status === 'operational' && (
                <div style={{ background: 'var(--green-bg)', border: '1px solid #1a4030', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--green)', lineHeight: 1.5 }}>
                  ✓ {selected.final_statement ?? FINAL_STATEMENT}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!selected.completed_at && access.canCompleteJournal && (
                  <button disabled={completing} onClick={async () => { await completeJournal(selected.id); refetch(); setSelected(null) }}
                    style={{ width: '100%', padding: 10, borderRadius: 8, background: completing ? '#1a2e42' : 'var(--green-bg)', color: completing ? 'var(--text-4)' : 'var(--green)', border: '1px solid #1a4030', fontSize: 13, fontWeight: 600, cursor: completing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {completing ? 'Сохранение…' : '✓ Завершить ТО'}
                  </button>
                )}
                <button onClick={() => handlePrintObjectJournal(selected)}
                  title="Журнал ТО объекта — все записи (Приложение №2 к ТЗ)"
                  style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>📄 Журнал объекта (Прил. №2)</button>
                {selected.completed_at && (
                  <AiSummaryButton journalId={selected.id} existingSummary={selected.final_statement ?? null} />
                )}
                {access.canEditJournal && (
                  <button onClick={() => setEdit(selected)}
                    style={{ width: '100%', padding: 10, borderRadius: 8, background: 'transparent', color: '#62b8f5', border: '1px solid #1a7dbd44', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✏ Редактировать</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateJournalModal
        open={createOpen}
        onClose={() => { setCreate(false); setCreateForObjectId(undefined) }}
        onCreated={refetch}
        initialObjectId={createForObjectId}
        objects={objectsData?.items ?? []}
      />
      <EditJournalModal
        journal={editTarget}
        open={!!editTarget}
        onClose={() => setEdit(null)}
        onSaved={() => { refetch(); setEdit(null) }}
        objectId={editTarget?.object_id}
      />
    </div>
  )
}
