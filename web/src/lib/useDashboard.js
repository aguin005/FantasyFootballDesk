import { useCallback, useEffect, useRef, useState } from 'react'

const DATA_URL = `${import.meta.env.BASE_URL}data/dashboard.json`
const STAMP_URL = `${import.meta.env.BASE_URL}data/stamp.json`

// How often the open app asks whether newer data has been published. The answer
// is a few bytes, and the full file is only downloaded when it says yes.
const CHECK_EVERY_MS = 60 * 1000
// A copy published before the stamp existed has none, so the full file is
// fetched on this slower clock instead.
const WITHOUT_STAMP_MS = 10 * 60 * 1000

/**
 * Loads dashboard.json and keeps it fresh.
 *
 * The copy saved for offline use is shown at once, so the app opens on real
 * content instead of a loading screen, and the network's answer replaces it a
 * moment later. cached is true for that moment. While the app is on screen it
 * checks every minute for a newer refresh and loads it without being asked.
 *
 * A failed refresh never throws away data that already loaded. Showing the last
 * good copy with a note is more useful than an error screen, especially offline.
 * reload() resolves to the new data, or null when the fetch failed.
 */
export function useDashboard() {
  const [state, setState] = useState({ data: null, error: null, refreshing: false, cached: false })
  const lastFetch = useRef(0)
  const inFlight = useRef(null)
  const generatedAt = useRef(null)
  generatedAt.current = state.data?.generatedAt || null

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
        setState({ data, error: null, refreshing: false, cached: false })
        return data
      })
      .catch((error) => {
        const kind = error.kind || (navigator.onLine === false ? 'offline' : 'network')
        setState((current) => ({ ...current, error: { kind, status: error.status }, refreshing: false, cached: false }))
        return null
      })
      .finally(() => {
        inFlight.current = null
      })

    return inFlight.current
  }, [])

  /** Loads the full file only when the published stamp differs from what is on screen. */
  const check = useCallback(async () => {
    if (inFlight.current || document.visibilityState === 'hidden') return
    const published = await readStamp()
    if (published === undefined) {
      if (Date.now() - lastFetch.current > WITHOUT_STAMP_MS) load()
    } else if (published && published !== generatedAt.current) {
      load()
    }
  }, [load])

  useEffect(() => {
    readCached().then((data) => {
      if (data) setState((current) => (current.data ? current : { ...current, data, cached: true }))
    })
    load()

    const timer = setInterval(check, CHECK_EVERY_MS)
    const onReturn = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('online', load)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('online', load)
    }
  }, [load, check])

  return { ...state, reload: load }
}

/**
 * When the published data was generated. Undefined when there is no stamp to
 * read, which is different from null, a stamp that could not be fetched just now.
 */
async function readStamp() {
  try {
    const response = await fetch(`${STAMP_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (response.status === 404) return undefined
    if (!response.ok) return null
    // A host that answers a missing file with its home page has no stamp either.
    const stamp = await response.json().catch(() => null)
    return typeof stamp?.generatedAt === 'string' ? stamp.generatedAt : undefined
  } catch {
    return null
  }
}

/** The copy the service worker saved on the last successful load, or null. */
async function readCached() {
  try {
    if (!('caches' in window)) return null
    const url = new URL(DATA_URL, window.location.href)
    const response = await caches.match(url.origin + url.pathname)
    const data = response ? await response.json() : null
    return data?.generatedAt ? data : null
  } catch {
    return null
  }
}

function loadError(kind, status) {
  const error = new Error(kind)
  error.kind = kind
  error.status = status
  return error
}
