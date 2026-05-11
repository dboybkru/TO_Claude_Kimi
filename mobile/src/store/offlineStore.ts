import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ObjectItem } from '../types'
import { objectsApi } from '../api/services'

const CACHE_KEY = 'offline_objects_cache'

interface OfflineState {
  cachedObjects: ObjectItem[]
  objectMap: Record<string, ObjectItem>
  isOffline: boolean
  isLoading: boolean
}

interface OfflineActions {
  syncObjects: (params?: Record<string, unknown>) => Promise<ObjectItem[]>
  loadCachedObjects: () => Promise<ObjectItem[]>
  getObjectById: (id: string) => ObjectItem | undefined
  setOffline: (value: boolean) => void
}

function buildObjectMap(objects: ObjectItem[]): Record<string, ObjectItem> {
  const map: Record<string, ObjectItem> = {}
  objects.forEach((obj) => {
    map[obj.id] = obj
  })
  return map
}

export const useOfflineStore = create<OfflineState & OfflineActions>((set, get) => ({
  cachedObjects: [],
  objectMap: {},
  isOffline: false,
  isLoading: false,

  syncObjects: async (params) => {
    set({ isLoading: true })
    try {
      const response = await objectsApi.list(params)
      const items: ObjectItem[] = response.data.items || []
      const map = buildObjectMap(items)
      set({ cachedObjects: items, objectMap: map, isOffline: false })
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items))
      set({ isLoading: false })
      return items
    } catch (error) {
      const cached = await get().loadCachedObjects()
      set({ isOffline: true, isLoading: false })
      return cached
    }
  },

  loadCachedObjects: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY)
      if (raw) {
        const items: ObjectItem[] = JSON.parse(raw)
        const map = buildObjectMap(items)
        set({ cachedObjects: items, objectMap: map })
        return items
      }
    } catch {
      // ignore parse errors
    }
    return []
  },

  getObjectById: (id) => {
    return get().objectMap[id]
  },

  setOffline: (value) => set({ isOffline: value }),
}))
