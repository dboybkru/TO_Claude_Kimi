import api from './client'
import type {
  ObjectItem, RepairTicket, MaintenanceJournal, MaintenanceSchedule,
  User, PaginatedResponse, DashboardStats,
  ObjectCreate, RepairTicketCreate, MaintenanceJournalCreate, MaintenanceScheduleCreate,
  RoutePlanRequest, RoutePlanResponse,
} from './types'

// ── Seed ─────────────────────────────────────────────────────────────────────
export const seedApi = {
  seedObjects: () => api.post<{ message: string; seeded: number }>('/seed/objects').then(r => r.data),
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DistrictStat { name: string; done: number; pending: number; overdue: number; total: number }
export interface TechnicianStat { id: string; full_name: string; phone?: string; done: number; total: number }

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/stats').then((r) => r.data),
  districts: (month: number, year: number) =>
    api.get<DistrictStat[]>('/dashboard/districts', { params: { month, year } }).then((r) => r.data),
  technicians: (month: number, year: number) =>
    api.get<TechnicianStat[]>('/dashboard/technicians', { params: { month, year } }).then((r) => r.data),
}

// ── Objects ───────────────────────────────────────────────────────────────────
export const objectsApi = {
  list: (params?: { page?: number; size?: number; status?: string; region?: string }) =>
    api.get<PaginatedResponse<ObjectItem>>('/objects', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<ObjectItem>(`/objects/${id}`).then((r) => r.data),

  search: (q: string) =>
    api.get<ObjectItem[]>('/objects/search', { params: { q } }).then((r) => r.data),

  create: (data: ObjectCreate) =>
    api.post<ObjectItem>('/objects', data).then((r) => r.data),

  update: (id: string, data: Partial<ObjectCreate>) =>
    api.put<ObjectItem>(`/objects/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/objects/${id}`),
}

// ── Tickets ───────────────────────────────────────────────────────────────────
export const ticketsApi = {
  list: (params?: { page?: number; size?: number; status?: string; priority?: string; object_id?: string }) =>
    api.get<PaginatedResponse<RepairTicket>>('/tickets', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<RepairTicket>(`/tickets/${id}`).then((r) => r.data),

  create: (data: RepairTicketCreate) =>
    api.post<RepairTicket>('/tickets', data).then((r) => r.data),

  update: (id: string, data: Partial<RepairTicket>) =>
    api.put<RepairTicket>(`/tickets/${id}`, data).then((r) => r.data),

  assign: (id: string, technician_id: string) =>
    api.post<RepairTicket>(`/tickets/${id}/assign`, { technician_id }).then((r) => r.data),

  resolve: (id: string, resolution_notes: string, diagnosis_act_url?: string) =>
    api.post<RepairTicket>(`/tickets/${id}/resolve`, { resolution_notes, diagnosis_act_url }).then((r) => r.data),

  callbackQueue: () =>
    api.get<RepairTicket[]>('/tickets/callback-queue').then((r) => r.data),
}

// ── Journals ──────────────────────────────────────────────────────────────────
export const journalsApi = {
  list: (params?: { page?: number; size?: number; object_id?: string; technician_id?: string; system_status?: string }) =>
    api.get<PaginatedResponse<MaintenanceJournal>>('/journals', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<MaintenanceJournal>(`/journals/${id}`).then((r) => r.data),

  create: (data: MaintenanceJournalCreate) =>
    api.post<MaintenanceJournal>('/journals', data).then((r) => r.data),

  update: (id: string, data: Partial<MaintenanceJournal>) =>
    api.put<MaintenanceJournal>(`/journals/${id}`, data).then((r) => r.data),

  uploadPhotos: (id: string, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post<MaintenanceJournal>(`/journals/${id}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  deletePhoto: (id: string, filename: string) =>
    api.delete<MaintenanceJournal>(`/journals/${id}/photos/${filename}`).then((r) => r.data),
}

// ── Schedule ──────────────────────────────────────────────────────────────────
export const scheduleApi = {
  list: (params?: { page?: number; size?: number; month?: number; year?: number; technician_id?: string; status?: string }) =>
    api.get<PaginatedResponse<MaintenanceSchedule>>('/schedule', { params }).then((r) => r.data),

  stats: (month: number, year: number) =>
    api.get<Record<string, number>>('/schedule/stats', { params: { month, year } }).then((r) => r.data),

  create: (data: MaintenanceScheduleCreate) =>
    api.post<MaintenanceSchedule>('/schedule', data).then((r) => r.data),

  update: (id: string, data: Partial<MaintenanceSchedule>) =>
    api.put<MaintenanceSchedule>(`/schedule/${id}`, data).then((r) => r.data),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const routesApi = {
  plan: (data: RoutePlanRequest) =>
    api.post<RoutePlanResponse>('/routes/plan', data).then((r) => r.data),
}

export interface UserUpdate {
  full_name?: string
  phone?: string
  role?: string
  is_active?: boolean
  password?: string
}

export interface UserCreate {
  email: string
  full_name: string
  phone?: string
  role: string
  password: string
  is_active?: boolean
}

export const usersApi = {
  list: () =>
    api.get<User[]>('/users').then((r) => r.data),

  get: (id: string) =>
    api.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: UserCreate) =>
    api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: UserUpdate) =>
    api.put<User>(`/users/${id}`, data).then((r) => r.data),

  updateRole: (id: string, role: string) =>
    api.put<User>(`/users/${id}/role`, null, { params: { role } }).then((r) => r.data),
}

// ── Voice / AI ────────────────────────────────────────────────────────────────

export interface VoiceInfo {
  phone_number: string
  webhook_url: string
  webhook_secured: boolean
  ai_configured: boolean
  models: Record<string, string>
}

export interface CallResult {
  ticket_id: string | null
  ticket_number: string | null
  object_id: string | null
  priority: string
  needs_callback: boolean
  summary: string
  transcript: string | null
}

export const voiceApi = {
  info: () =>
    api.get<VoiceInfo>('/voice/info').then((r) => r.data),

  analyzeTranscript: (transcript: string, callerPhone = '', createTicket = true) => {
    const form = new FormData()
    form.append('transcript', transcript)
    form.append('caller_phone', callerPhone)
    form.append('create_ticket', String(createTicket))
    return api.post<CallResult>('/voice/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  summarizeJournal: (journalId: string) =>
    api.post<{ journal_id: string; summary: string }>(`/voice/summarize-journal/${journalId}`)
      .then((r) => r.data),

  objectReport: (objectId: string) =>
    api.post<{ object_id: string; object_name: string; report: string }>(`/voice/report/object/${objectId}`)
      .then((r) => r.data),

  ticketHint: (description: string) =>
    api.post<{ priority?: string; fault_type?: string; title?: string }>('/voice/hint', { description })
      .then((r) => r.data)
      .catch(() => ({ priority: undefined, fault_type: undefined, title: undefined })),

  // ── Advanced AI ──────────────────────────────────────────────────────────────
  dailyDigest: () =>
    api.get<{ digest: string; generated_at: string }>('/voice/digest').then((r) => r.data),

  similarTickets: (title: string, description: string, fault_type?: string) =>
    api.post<{ similar: string }>('/voice/similar-tickets', { title, description, fault_type })
      .then((r) => r.data)
      .catch(() => ({ similar: '' })),

  journalAssist: (free_text: string, object_id?: string) =>
    api.post<{ result_description?: string; system_status?: string; final_statement?: string; recommended_actions?: string; parts_used?: string }>(
      '/voice/journal-assist', { free_text, object_id }
    ).then((r) => r.data)
      .catch(() => ({ result_description: undefined, system_status: undefined, final_statement: undefined, recommended_actions: undefined, parts_used: undefined })),

  suggestTechnician: (title: string, fault_type: string | undefined, object_id: string | undefined) =>
    api.post<{ technician_id?: string; technician_name?: string; reason?: string }>(
      '/voice/suggest-technician', { title, fault_type, object_id }
    ).then((r) => r.data)
      .catch(() => ({ technician_id: undefined, technician_name: undefined, reason: undefined })),

  predictive: (objectId: string) =>
    api.get<{ object_id: string; risk_level: string; reason: string; recommended_action: string; days_until_critical?: number }>(
      `/voice/predictive/${objectId}`
    ).then((r) => r.data).catch(() => null),

  transcribeAudio: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ transcript: string; filename: string }>('/voice/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

export { default as api } from './client'
