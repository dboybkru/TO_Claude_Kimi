import api from './client'
import { LoginCredentials, AuthTokens, CreateJournalDto } from '../types'

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<AuthTokens>('/auth/login', credentials),

  refresh: (token: string) =>
    api.post<AuthTokens>('/auth/refresh', { refresh_token: token }),

  me: () => api.get('/auth/me'),
}

export const objectsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/objects', { params }),

  get: (id: string) =>
    api.get(`/objects/${id}`),
}

export const journalsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/journals', { params }),

  get: (id: string) =>
    api.get(`/journals/${id}`),

  create: (data: CreateJournalDto) =>
    api.post('/journals', data),

  update: (id: string, data: Partial<CreateJournalDto>) =>
    api.put(`/journals/${id}`, data),
}

export const ticketsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/tickets', { params }),

  get: (id: string) =>
    api.get(`/tickets/${id}`),
}
