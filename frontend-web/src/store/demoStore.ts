import type { User, UserRole } from '../api/types'

const STORAGE_KEY = 'secureto_demo_users'
const SESSION_KEY = 'secureto_demo_session'

export interface DemoCredential {
  email: string
  password: string
  user: User
}

// Demo credentials — only active when backend is unreachable (ECONNREFUSED / 5xx).
// Real auth always goes through the backend; this is a UI smoke-test fallback only.
const DEMO_ADMIN_EMAIL    = import.meta.env.VITE_DEMO_EMAIL    ?? 'admin@example.com'
const DEMO_ADMIN_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'changeme'

const DEFAULT_ADMIN: DemoCredential = {
  email: DEMO_ADMIN_EMAIL,
  password: DEMO_ADMIN_PASSWORD,
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: DEMO_ADMIN_EMAIL,
    full_name: 'Администратор (демо)',
    role: 'ADMIN',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
}

function load(): DemoCredential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : [DEFAULT_ADMIN]
  } catch {
    return [DEFAULT_ADMIN]
  }
}

function save(creds: DemoCredential[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds))
}

export function demoLogin(email: string, password: string): User | null {
  const creds = load()
  const found = creds.find((c) => c.email.toLowerCase() === email.toLowerCase() && c.password === password)
  return found?.user ?? null
}

export function demoRegister(params: {
  email: string
  password: string
  full_name: string
  phone?: string
  role: UserRole
}): { ok: true; user: User } | { ok: false; error: string } {
  const creds = load()
  if (creds.some((c) => c.email.toLowerCase() === params.email.toLowerCase())) {
    return { ok: false, error: 'Email уже зарегистрирован' }
  }
  const user: User = {
    id: crypto.randomUUID(),
    email: params.email,
    full_name: params.full_name,
    phone: params.phone,
    role: params.role,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  creds.push({ email: params.email, password: params.password, user })
  save(creds)
  return { ok: true, user }
}

/** Returns true when backend is unreachable or broken (use demo mode) */
export function isBackendDown(status?: number): boolean {
  if (!status) return true                    // network error / ECONNREFUSED
  if (status === 401) return false            // correct 401 means backend IS working
  return status >= 500                        // 500/502/503/504 — backend broken/down
}
