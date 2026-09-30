import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const CLOSE_MS = 480
const DISMISS_PX = 110
const DISMISS_VELOCITY = 0.6

/**
 * A glass bottom sheet, or with side set, a panel pulled in from the right edge.
 * It closes from the button, the backdrop, the Escape key, or a drag on the
 * grabber toward the edge it came from, and it stays mounted through its closing
 * animation so the content does not vanish before the sheet does.
 */
export default function Sheet({ open, onClose, labelledBy, side = false, children }) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)
  const closeButton = useRef(null)
  const returnFocus = useRef(null)

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement
      setMounted(true)
      return undefined
    }
    setVisible(false)
    const timer = setTimeout(() => setMounted(false), CLOSE_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Two frames, so the closed position is painted once before the transition
  // to open starts. One frame is not always enough for the browser to commit it.
  useEffect(() => {
    if (!mounted || !open) return undefined
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setVisible(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [mounted, open])

  useEffect(() => {
    if (!mounted) return undefined
    document.body.classList.add('is-locked')
    return () => document.body.classList.remove('is-locked')
  }, [mounted])

  useEffect(() => {
    if (visible) {
      closeButton.current?.focus({ preventScroll: true })
      return undefined
    }
    if (!open && returnFocus.current instanceof HTMLElement) {
      returnFocus.current.focus({ preventScroll: true })
      returnFocus.current = null
    }
    return undefined
  }, [visible, open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  // Down for a bottom sheet, right for a side panel: toward the edge it came from.
  const position = (event) => (side ? event.clientX : event.clientY)
  const onPointerDown = (event) => {
    drag.current = { start: position(event), t: performance.now() }
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event) => {
    if (!drag.current) return
    setOffset(Math.max(0, position(event) - drag.current.start))
  }
  const onPointerUp = (event) => {
    if (!drag.current) return
    const distance = position(event) - drag.current.start
    const velocity = distance / Math.max(1, performance.now() - drag.current.t)
    drag.current = null
    setDragging(false)
    setOffset(0)
    if (distance > DISMISS_PX || velocity > DISMISS_VELOCITY) onClose()
  }

  const className = ['sheet', 'glass', 'glass-strong', side && 'is-side', dragging && 'is-dragging']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={visible ? 'sheet-layer is-open' : 'sheet-layer'}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{ '--drag': `${offset}px` }}
      >
        <div
          className="sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        />
        <button
          ref={closeButton}
          type="button"
          className="icon-btn sheet-close press"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="close" strokeWidth={2.6} />
        </button>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
