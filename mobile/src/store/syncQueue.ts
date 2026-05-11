import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../api/client'
import { useOfflineStore } from './offlineStore'

interface SyncItem {
  id: string
  method: 'POST' | 'PUT' | 'PATCH'
  endpoint: string
  payload: unknown
  retries: number
  createdAt: string
}

interface SyncQueueState {
  queue: SyncItem[]
  isSyncing: boolean
  lastSync: string | null
}

interface SyncQueueActions {
  enqueue: (item: Omit<SyncItem, 'retries' | 'createdAt'>) => void
  dequeue: (id: string) => void
  processQueue: () => Promise<void>
  clearQueue: () => void
}

export const useSyncQueue = create<SyncQueueState & SyncQueueActions>()(
  persist(
    (set, get) => ({
      queue: [],
      isSyncing: false,
      lastSync: null,

      enqueue: (item) => {
        const newItem: SyncItem = {
          ...item,
          id: item.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          retries: 0,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ queue: [...state.queue, newItem] }))
      },

      dequeue: (id) => {
        set((state) => ({ queue: state.queue.filter((i) => i.id !== id) }))
      },

      processQueue: async () => {
        const { queue, isSyncing } = get()
        if (isSyncing || queue.length === 0) return

        set({ isSyncing: true })
        const offlineStore = useOfflineStore.getState()

        for (const item of queue) {
          try {
            if (item.method === 'POST') {
              await api.post(item.endpoint, item.payload)
            } else if (item.method === 'PUT') {
              await api.put(item.endpoint, item.payload)
            } else if (item.method === 'PATCH') {
              await api.patch(item.endpoint, item.payload)
            }
            get().dequeue(item.id)
          } catch (error) {
            if (item.retries >= 3) {
              // Max retries reached — keep in queue for manual resolution
              console.error(`Sync failed for ${item.endpoint} after 3 retries`)
            } else {
              set((state) => ({
                queue: state.queue.map((q) =>
                  q.id === item.id ? { ...q, retries: q.retries + 1 } : q,
                ),
              }))
            }
          }
        }

        // Refresh cache after sync
        await offlineStore.syncObjects()
        set({ isSyncing: false, lastSync: new Date().toISOString() })
      },

      clearQueue: () => set({ queue: [], isSyncing: false }),
    }),
    {
      name: 'sync-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ queue: state.queue, lastSync: state.lastSync }),
    },
  ),
)
