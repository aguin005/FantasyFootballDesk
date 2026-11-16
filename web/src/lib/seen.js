import { useEffect, useRef, useState } from 'react'
import { useSetting } from './storage.js'

/**
 * Which changes you have not seen yet.
 *
 * The refresh runs every few minutes and cannot know when you last looked, so
 * its own "new" flag only means new since the run before. The browser does know:
 * it remembers, per league, the newest change that was on screen the last time
 * you had that league's Today tab open, and anything detected after that is new.
 *
 * Changes stay marked as new for the whole visit, so they do not dim while you
 * are reading them. The visit ends when you switch league or tab or leave the
 * app, and the next one starts from what was on screen.
 */

/** When the newest change in a league was detected, in ms, or 0 with none. */
export function latestChange(changes, leagueId) {
  let latest = 0
  for (const entry of changes || []) {
    if (entry.leagueId !== leagueId) continue
    const at = Date.parse(entry.detectedAt)
    if (at > latest) latest = at
  }
  return latest
}

/** True when a change was detected after the given moment. */
export function isUnseen(entry, since) {
  return Date.parse(entry.detectedAt) > (since || 0)
}

/** League id to how many of its changes are newer than what you last saw there. */
export function unseenCounts(changes, seen) {
  const counts = new Map()
  for (const entry of changes || []) {
    if (!isUnseen(entry, seen?.[entry.leagueId])) continue
    counts.set(entry.leagueId, (counts.get(entry.leagueId) || 0) + 1)
  }
  return counts
}

/**
 * Tracks what you have seen. viewingId is the league whose changes are on screen
 * right now, or null. Returns since, the moment to judge that league's changes
 * against during this visit, and counts for every league's badge.
 */
export function useSeenChanges(changes, viewingId) {
  const [seen, setSeen] = useSetting('seen', {})
  const [visit, setVisit] = useState(null)
  const stored = useRef(seen)
  stored.current = seen

  // A visit keeps the moment it started from, so what was new when you arrived
  // stays marked until you leave.
  useEffect(() => {
    if (!viewingId) return undefined
    setVisit({ id: viewingId, since: stored.current[viewingId] || 0 })
    return () => setVisit(null)
  }, [viewingId])

  // Everything on screen counts as seen from now on, including changes that
  // arrive while you are looking.
  const latest = viewingId ? latestChange(changes, viewingId) : 0
  useEffect(() => {
    if (!viewingId || latest <= (stored.current[viewingId] || 0)) return
    setSeen({ ...stored.current, [viewingId]: latest })
  }, [viewingId, latest, setSeen])

  return {
    since: (leagueId) => (visit?.id === leagueId ? visit.since : seen[leagueId] || 0),
    counts: unseenCounts(changes, seen)
  }
}
