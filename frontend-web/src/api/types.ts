export type UserRole = 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'TECHNICIAN' | 'CUSTOMER' | 'AUDITOR'

export type ObjectType = 'OS' | 'OTS' | 'SKUD' | 'OS_OTS' | 'SKUD_OS'
export type ObjectStatus = 'active' | 'inactive' | 'in_repair'

export type TicketPriority = 'low' | 'normal' | 'high' | 'critical'
export type TicketStatus = 'new' | 'callback_required' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
export type TicketSource = 'voice_bot' | 'manual' | 'journal_auto'
export type FaultType = 'hardware' | 'software' | 'power' | 'sensor' | 'access' | 'other'

export type ScheduleStatus = 'planned' | 'done' | 'overdue' | 'cancelled'
export type JournalSystemStatus = 'operational' | 'repaired' | 'needs_repair'

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ObjectItem {
  id: string
  name: string
  address: string
  address_normalized: string
  address_aliases?: string[]
  type: ObjectType
  region?: string
  equipment?: unknown[]
  contact_person?: { name?: string; phone?: string }
  monthly_maintenance_required: boolean
  status: ObjectStatus
  contract_number?: string
  notes?: string
  lat?: number
  lng?: number
  last_maintenance_at?: string
  customer_id?: string
  responsible_technician_id?: string
  created_at: string
  updated_at: string
}

export interface MaintenanceJournal {
  id: string
  object_id: string
  technician_id: string
  journal_number?: number
  arrived_at?: string
  completed_at?: string
  checklist?: ChecklistItem[]
  result_description?: string
  system_status?: JournalSystemStatus
  final_statement?: string
  photos?: string[]
  technician_signature?: string
  customer_signature?: string
  customer_rep_name?: string
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: number
  text: string
  done: boolean
}

export interface RepairTicket {
  id: string
  ticket_number: string
  source: TicketSource
  object_id?: string
  caller_phone?: string
  call_recording_url?: string
  called_at?: string
  title: string
  description?: string
  fault_type?: FaultType
  priority: TicketPriority
  status: TicketStatus
  reporter_id?: string
  assigned_to_id?: string
  assigned_at?: string
  resolved_at?: string
  resolution_notes?: string
  diagnosis_act_url?: string
  created_at: string
  updated_at: string
}

export interface MaintenanceSchedule {
  id: string
  object_id: string
  technician_id?: string
  scheduled_date: string
  month: number
  year: number
  schedule_type: 'planned' | 'unplanned'
  status: ScheduleStatus
  notes?: string
  journal_id?: string
  created_at: string
  updated_at: string
}

// ── Create/Update payloads ────────────────────────────────────────────────────

export interface ObjectCreate {
  name: string
  address: string
  address_normalized?: string
  type: ObjectType
  region?: string
  status?: ObjectStatus
  contract_number?: string
  notes?: string
  lat?: number
  lng?: number
  customer_id?: string
  responsible_technician_id?: string
  monthly_maintenance_required?: boolean
  equipment?: unknown[]
  contact_person?: { name?: string; phone?: string }
}

export interface RepairTicketCreate {
  object_id?: string
  title: string
  description?: string
  fault_type?: FaultType
  priority?: TicketPriority
  source?: TicketSource
  caller_phone?: string
}

export interface MaintenanceJournalCreate {
  object_id: string
  technician_id: string
  arrived_at?: string
  checklist?: ChecklistItem[]
  result_description?: string
  system_status?: JournalSystemStatus
  customer_rep_name?: string
  photos?: string[]
  technician_signature?: string
  customer_signature?: string
}

export interface MaintenanceScheduleCreate {
  object_id: string
  technician_id?: string
  scheduled_date: string
  month: number
  year: number
  schedule_type?: 'planned' | 'unplanned'
  notes?: string
}

export interface RoutePlanRequest {
  object_ids?: string[]
  region?: string
  object_type?: ObjectType
  start_lat?: number
  start_lng?: number
  end_lat?: number
  end_lng?: number
  workday_minutes?: number
  service_minutes?: number
  reserve_minutes?: number
  average_speed_kmh?: number
  limit?: number
}

export interface RouteStop {
  order: number
  object_id: string
  name: string
  address: string
  region?: string
  type: ObjectType
  lat: number
  lng: number
  distance_km: number
  travel_minutes: number
  service_minutes: number
  cumulative_minutes: number
}

export interface RoutePlanResponse {
  stops: RouteStop[]
  skipped: number
  total_distance_km: number
  total_travel_minutes: number
  total_service_minutes: number
  total_minutes: number
  available_minutes: number
  reserve_minutes: number
  start_lat: number
  start_lng: number
  end_lat?: number
  end_lng?: number
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface DashboardStats {
  total_objects: number
  active_objects: number
  maintenance_done_this_month: number
  maintenance_planned_this_month: number
  overdue_count: number
  open_tickets: number
  critical_tickets: number
  high_tickets: number
}
