import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// ── Request: attach Bearer token ──────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: auto-refresh on 401 ────────────────────────────────────────────
let _refreshing = false
type QueueEntry = { resolve: (token: string) => void; reject: (err: unknown) => void }
let _refreshQueue: QueueEntry[] = []

function _flushQueue(token: string | null, error: unknown) {
  _refreshQueue.forEach(({ resolve, reject }) => token ? resolve(token) : reject(error))
  _refreshQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as typeof err.config & { _retry?: boolean }

    // Only attempt refresh on 401, and only once per request
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err)
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState()

    // No refresh token stored — force logout
    if (!refreshToken || refreshToken === 'demo-token') {
      logout()
      return Promise.reject(err)
    }

    // If another request is already refreshing, queue this one
    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({
          resolve: (token) => {
            original!.headers!.Authorization = `Bearer ${token}`
            resolve(api(original!))
          },
          reject,
        })
      })
    }

    original._retry = true
    _refreshing = true

    try {
      const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
      setTokens(data.access_token, data.refresh_token)
      _flushQueue(data.access_token, null)
      original!.headers!.Authorization = `Bearer ${data.access_token}`
      return api(original!)
    } catch (refreshErr) {
      _flushQueue(null, refreshErr)  // reject all queued requests
      logout()
      return Promise.reject(err)
    } finally {
      _refreshing = false
    }
  },
)

export default api
