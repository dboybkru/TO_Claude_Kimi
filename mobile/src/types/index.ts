export type UserRole = 'admin' | 'manager' | 'dispatcher' | 'technician' | 'customer' | 'auditor' | 'robot_api'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone?: string | null
  is_active: boolean
  created_at: string
}

export interface ObjectItem {
  id: string
  name: string
  address: string
  address_normalized?: string | null
  address_aliases?: string[] | null
  customer_id?: string | null
  status: 'active' | 'inactive' | 'archived'
  system_type?: string | null
  equipment?: string | null
  last_maintenance_at?: string | null
  next_maintenance_date?: string | null
  monthly_maintenance_required?: boolean
  responsible_technician_id?: string | null
  latitude?: number | null
  longitude?: number | null
  contact_person?: string | null
  contact_phone?: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceJournal {
  id: string
  object_id: string
  technician_id: string
  journal_number: number
  arrived_at?: string | null
  departed_at?: string | null
  checklist?: string[] | null
  result_description?: string | null
  system_status?: 'operational' | 'needs_repair' | 'repaired' | null
  final_statement?: string | null
  photos?: string[] | null
  technician_signature?: string | null
  customer_signature?: string | null
  customer_rep_name?: string | null
  created_at: string
  updated_at: string
}

export interface CreateJournalDto {
  object_id: string
  technician_id?: string
  checklist?: string[]
  result_description?: string
  system_status?: 'operational' | 'needs_repair' | 'repaired'
  photos?: string[]
  technician_signature?: string
  customer_signature?: string
  customer_rep_name?: string
}

export interface RepairTicket {
  id: string
  ticket_number: string
  object_id: string
  title: string
  description?: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
  source?: string | null
  caller_phone?: string | null
  call_recording_url?: string | null
  called_at?: string | null
  assigned_to_id?: string | null
  created_by_id?: string | null
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}
