import type { UserRole } from '../api/types'

/** What each role can do in the UI */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN:      'Администратор',
  MANAGER:    'Менеджер',
  DISPATCHER: 'Диспетчер',
  TECHNICIAN: 'Монтажник',
  CUSTOMER:   'Клиент',
  AUDITOR:    'Аудитор',
}

export const ROLE_COLORS: Record<string, [string, string]> = {
  ADMIN:      ['#2a0a3a', '#c490f0'],
  MANAGER:    ['#0a2030', '#4d8aba'],
  DISPATCHER: ['#0a2518', '#3aaa70'],
  TECHNICIAN: ['#2d1a00', '#f0a830'],
  CUSTOMER:   ['#141a1a', '#3d5a72'],
  AUDITOR:    ['#0f1a2a', '#62b8f5'],
}

/** Derive a set of boolean permission flags from a role string */
export function getAccess(role: UserRole | string | undefined) {
  const r = role ?? ''
  const is = (s: string) => r === s

  const admin     = is('ADMIN')
  const manager   = is('MANAGER') || admin
  const dispatcher = is('DISPATCHER') || manager
  const technician = is('TECHNICIAN')
  const customer  = is('CUSTOMER')
  const auditor   = is('AUDITOR')
  const readOnly  = customer || auditor

  return {
    // Object management
    canCreateObject:  manager,
    canEditObject:    manager,
    canDeleteObject:  admin,

    // Tickets
    canCreateTicket:  !readOnly,
    canAssignTicket:  dispatcher,
    canResolveTicket: dispatcher || technician,
    canViewCallbacks: dispatcher,

    // Journals
    canCreateJournal: manager || technician,
    canEditJournal:   manager || technician,
    canCompleteJournal: manager || technician,

    // Schedule
    canCreateSchedule: manager,
    canMarkScheduleDone: manager || technician,

    // Users
    canManageUsers: admin,
    canViewUsers:   admin,

    // Export
    canExport: !readOnly,

    // General
    readOnly,
    isAdmin: admin,
    isManager: manager,
    isDispatcher: dispatcher,
    isTechnician: technician,
    isCustomer: customer,
    isAuditor: auditor,
  }
}

export type Access = ReturnType<typeof getAccess>
