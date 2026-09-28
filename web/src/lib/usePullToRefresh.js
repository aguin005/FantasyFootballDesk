import { useEffect, useRef, useState } from 'react'

const TRIGGER_PX = 72
const MAX_PX = 110

/**
 * Pull down from the top of the page to refresh, the way every iOS list works.
 * A home screen web app gets no browser reload gesture, so this is the only way
 * to ask for fresh data without hunting for a button.
 *
 * Returns how far the page is being pulled, for the indicator to follow.
 */
export function usePullToRefresh(onRefresh, enabled = true) {
  const [distance, setDistance] = useState(0)
  const callback = useRef(onRefresh)
  callback.current = onRefresh

  useEffect(() => {
    if (!enabled) return undefined
    let startY = null
    let current = 0

    const onStart = (event) => {
      if (event.touches.length !== 1 || window.scrollY > 0) return
      startY = event.touches[0].clientY
    }
    const onMove = (event) => {
      if (startY == null) return
      const delta = event.touches[0].clientY - startY
      if (delta <= 0 || window.scrollY > 0) {
        current = 0
        setDistance(0)
        if (window.scrollY > 0) startY = null
        return
      }
      // Resistance grows the further you pull, like the native rubber band.
      current = Math.min(MAX_PX, delta * 0.5)
      setDistance(current)
    }
    const onEnd = () => {
      if (startY == null) return
      startY = null
      if (current >= TRIGGER_PX) callback.current()
      current = 0
      setDistance(0)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  return { distance, progress: Math.min(1, distance / TRIGGER_PX) }
}
