import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useAuthStore } from './store/authStore'
import { getAccess } from './utils/roles'

// ── Global Error Boundary — prevents blank screens, shows error ───────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack?.slice(0, 200))
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 40, background: '#0f1923', minHeight: '100vh', color: '#e8f1fa', fontFamily: 'monospace' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>💥</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e85d4a', marginBottom: 12 }}>Ошибка рендеринга</div>
          <pre style={{ background: '#091624', border: '1px solid #1a2e42', borderRadius: 8, padding: 16, fontSize: 12, color: '#f0a830', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {(error as Error).message}
            {'\n\n'}
            {(error as Error).stack?.slice(0, 600)}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard' }}
            style={{ marginTop: 20, padding: '10px 24px', background: '#1a7dbd', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            ↩ На главную
          </button>
        </div>
      </div>
    )
  }
}
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Objects from './pages/Objects'
import Tickets from './pages/Tickets'
import Journals from './pages/Journals'
import Schedule from './pages/Schedule'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import ObjectDetail from './pages/ObjectDetail'
import TicketDetail from './pages/TicketDetail'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

/** Redirect to /dashboard if user's role doesn't satisfy the check */
function RoleGuard({ check, children }: { check: (access: ReturnType<typeof getAccess>) => boolean; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role)
  const access = getAccess(role)
  return check(access) ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />

          {/* All roles see objects (backend filters by role) */}
          <Route path="objects"     element={<Objects />} />
          <Route path="objects/:id" element={<ObjectDetail />} />

          {/* All roles see tickets (backend filters by role) */}
          <Route path="tickets"     element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />

          {/* Journals: not for CUSTOMER / AUDITOR */}
          <Route
            path="journals"
            element={
              <RoleGuard check={a => !a.isCustomer && !a.isAuditor}>
                <Journals />
              </RoleGuard>
            }
          />

          {/* Schedule: not for CUSTOMER / AUDITOR */}
          <Route
            path="schedule"
            element={
              <RoleGuard check={a => !a.isCustomer && !a.isAuditor}>
                <Schedule />
              </RoleGuard>
            }
          />

          {/* Users: ADMIN only */}
          <Route
            path="users"
            element={
              <RoleGuard check={a => a.canManageUsers}>
                <Users />
              </RoleGuard>
            }
          />

          {/* Settings & Profile: all authenticated users */}
          <Route path="settings" element={<Settings />} />
          <Route path="profile"  element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
