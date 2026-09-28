import { useCallback, useEffect, useRef, useState } from 'react'

const DATA_URL = `${import.meta.env.BASE_URL}data/dashboard.json`

// A home screen app can sit in memory for days. Coming back to it after this long
// fetches again, since the Action publishes new data every 30 minutes.
const REFETCH_AFTER_MS = 5 * 60 * 1000

/**
 * Loads dashboard.json and keeps it fresh.
 *
 * A failed refresh never throws away data that already loaded. Showing the last
 * good copy with a note is more useful than an error screen, especially offline.
 * reload() resolves to the new data, or null when the fetch failed.
 */
export function useDashboard() {
  const [state, setState] = useState({ data: null, error: null, refreshing: false })
  const lastFetch = useRef(0)
  const inFlight = useRef(null)

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current
    setState((current) => ({ ...current, refreshing: true }))

    inFlight.current = fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw loadError(response.status === 404 ? 'missing' : 'server', response.status)
        try {
          return await response.json()
        } catch {
          throw loadError('corrupt')
        }
      })
      .then((data) => {
        lastFetch.current = Date.now()
        setState({ data, error: null, refreshing: false })
        return data
      })
      .catch((error) => {
        const kind = error.kind || (navigator.onLine === false ? 'offline' : 'network')
        setState((current) => ({ ...current, error: { kind, status: error.status }, refreshing: false }))
        return null
      })
      .finally(() => {
        inFlight.current = null
      })

    return inFlight.current
  }, [])

  useEffect(() => {
    load()
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetch.current > REFETCH_AFTER_MS) load()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('online', load)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('online', load)
    }
  }, [load])

  return { ...state, reload: load }
}

function loadError(kind, status) {
  const error = new Error(kind)
  error.kind = kind
  error.status = status
  return error
}
