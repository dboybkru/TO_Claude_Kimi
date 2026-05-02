import { useState, useEffect, useCallback, useRef } from 'react'
import { isBackendDown } from '../store/demoStore'
import { AxiosError } from 'axios'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (err) {
      const axiosErr = err as AxiosError
      if (isBackendDown(axiosErr.response?.status)) {
        setError('backend_down')
      } else {
        setError(axiosErr.message ?? 'Ошибка запроса')
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    fetch()
    return () => abortRef.current?.abort()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useMutation<T, P>(
  mutator: (params: P) => Promise<T>,
): {
  mutate: (params: P) => Promise<T | null>
  loading: boolean
  error: string | null
} {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(async (params: P): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await mutator(params)
      return result
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>
      setError(axiosErr.response?.data?.detail ?? axiosErr.message ?? 'Ошибка')
      return null
    } finally {
      setLoading(false)
    }
  }, [mutator])

  return { mutate, loading, error }
}
