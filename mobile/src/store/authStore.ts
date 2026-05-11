import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { User, AuthTokens } from '../types'
import { authApi } from '../api/services'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setTokens: (access: string, refresh: string) => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const response = await authApi.login({ email, password })
          const { access_token, refresh_token } = response.data
          set({
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
          })
          const meResponse = await authApi.me()
          set({ user: meResponse.data as User })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        })
      },

      setTokens: (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true })
      },

      restoreSession: async () => {
        const { accessToken, refreshToken } = get()
        if (!accessToken || !refreshToken) {
          set({ isAuthenticated: false })
          return
        }
        try {
          const meResponse = await authApi.me()
          set({ user: meResponse.data as User, isAuthenticated: true })
        } catch {
          try {
            const response = await authApi.refresh(refreshToken)
            const { access_token, refresh_token } = response.data
            set({
              accessToken: access_token,
              refreshToken: refresh_token,
              isAuthenticated: true,
            })
            const meResponse = await authApi.me()
            set({ user: meResponse.data as User })
          } catch {
            get().logout()
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
