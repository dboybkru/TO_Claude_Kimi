import { UserRole } from '../types'

export type Access = {
  objects: 'all' | 'own' | 'assigned' | 'none'
  tickets: 'all' | 'own' | 'assigned' | 'none'
  journals: 'all' | 'own' | 'assigned' | 'none'
  users: 'all' | 'none'
  settings: 'all' | 'read' | 'none'
}

export function getAccess(role: UserRole): Access {
  switch (role) {
    case 'admin':
      return { objects: 'all', tickets: 'all', journals: 'all', users: 'all', settings: 'all' }
    case 'manager':
      return { objects: 'all', tickets: 'all', journals: 'all', users: 'all', settings: 'read' }
    case 'dispatcher':
      return { objects: 'all', tickets: 'all', journals: 'all', users: 'none', settings: 'none' }
    case 'technician':
      return { objects: 'assigned', tickets: 'assigned', journals: 'own', users: 'none', settings: 'none' }
    case 'customer':
      return { objects: 'own', tickets: 'own', journals: 'own', users: 'none', settings: 'none' }
    case 'auditor':
      return { objects: 'all', tickets: 'all', journals: 'all', users: 'none', settings: 'read' }
    case 'robot_api':
      return { objects: 'all', tickets: 'all', journals: 'all', users: 'none', settings: 'none' }
    default:
      return { objects: 'none', tickets: 'none', journals: 'none', users: 'none', settings: 'none' }
  }
}
