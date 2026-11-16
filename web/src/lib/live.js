import { useEffect, useState } from 'react'

/**
 * Live scores and lineups for Sleeper leagues, read by the app itself.
 *
 * The published data is only as fresh as the last refresh, and GitHub runs those
 * late. Sleeper's matchups endpoint needs no login and answers any site, so while
 * the app is on screen it asks Sleeper directly, once a minute during games, and
 * lays the answer over the published data: every player's points, both totals,
 * and who is starting where, for your team and every other team in the league.
 *
 * Projections, news, injuries and waivers still come from the refresh. ESPN needs
 * your login cookies, which a web page must never hold, so ESPN leagues update
 * with each refresh instead.
 */

const BASE = 'https://api.sleeper.app/v1'
// Sleeper serves this endpoint from a cache it renews every minute.
const GAME_EVERY_MS = 60 * 1000
// Between games only lineup changes move, and those can wait a little.
const IDLE_EVERY_MS = 5 * 60 * 1000
// From shortly before a kickoff until the game is surely over.
const BEFORE_KICKOFF_MS = 15 * 60 * 1000
const GAME_OVER_MS = 4 * 60 * 60 * 1000

/** The Sleeper league id behind a dashboard league, or null for any other platform. */
export function sleeperId(league) {
  return league?.platform === 'sleeper' && league.id?.startsWith('sleeper:') ? league.id.slice('sleeper:'.length) : null
}

/** True while any NFL game this week is on or about to start. */
export function gamesOn(schedule, now = Date.now()) {
  return (schedule?.games || []).some((game) => {
    const kickoff = Date.parse(game.kickoffISO)
    return Number.isFinite(kickoff) && now >= kickoff - BEFORE_KICKOFF_MS && now <= kickoff + GAME_OVER_MS
  })
}

/** How often to ask Sleeper right now. */
export function liveInterval(schedule, now = Date.now()) {
  return gamesOn(schedule, now) ? GAME_EVERY_MS : IDLE_EVERY_MS
}

function total(entry) {
  const value = entry.custom_points ?? entry.points
  return typeof value === 'number' ? Number(value.toFixed(2)) : null
}

/** Player id to lineup slot for one roster's starters, or null when the lineup is unknown. */
function starterSlots(lineupSlots, starters) {
  if (!Array.isArray(lineupSlots) || !Array.isArray(starters)) return null
  const slots = new Map()
  starters.forEach((playerId, index) => {
    // An empty lineup spot comes back as "0".
    if (playerId && playerId !== '0') slots.set(String(playerId), lineupSlots[index] || 'FLEX')
  })
  return slots
}

/**
 * A league with Sleeper's current matchups laid over it. entries is the matchups
 * response for the dashboard's week and at is when it was fetched, in ms.
 *
 * Points and totals are replaced outright. A player moved into the lineup takes
 * the slot Sleeper lists them in, and a starter moved out goes to the bench.
 * A player dropped since the refresh is removed. One added since is not shown
 * until the next refresh, since nothing here knows who they are, though their
 * points already count in the team total.
 */
export function applyLive(league, entries, at, week = league?.matchup?.week ?? null) {
  if (!league || !Array.isArray(entries) || entries.length === 0) return league
  const byRoster = new Map(entries.map((entry) => [String(entry.roster_id), entry]))
  const myTeam = (league.teams || []).find((team) => team.isMine)
  const mine = myTeam ? byRoster.get(String(myTeam.teamId)) : null
  if (!mine) return league

  const overlay = (roster, entry) => {
    const slots = starterSlots(league.lineupSlots, entry.starters)
    const rostered = Array.isArray(entry.players) ? new Set(entry.players.map(String)) : null
    const points = entry.players_points || {}
    return roster
      .filter((player) => !rostered || rostered.has(String(player.playerId)))
      .map((player) => {
        const scored = points[player.playerId]
        const next = { ...player, points: typeof scored === 'number' ? Number(scored.toFixed(2)) : null }
        if (slots) {
          const slot = slots.get(String(player.playerId))
          if (slot) Object.assign(next, { slot, starter: true })
          else if (player.starter) Object.assign(next, { slot: 'BE', starter: false })
        }
        return next
      })
  }

  const theirs =
    mine.matchup_id == null
      ? null
      : entries.find((entry) => entry.matchup_id === mine.matchup_id && entry.roster_id !== mine.roster_id)

  // No matchup id is a bye week. A pairing with nobody on the other side is not
  // an answer either way, so what the refresh found stands.
  const matchup =
    mine.matchup_id == null
      ? null
      : theirs
        ? { week, opponentTeamId: theirs.roster_id, score: total(mine), opponentScore: total(theirs) }
        : league.matchup

  return {
    ...league,
    roster: overlay(league.roster, mine),
    teams: league.teams.map((team) => {
      const entry = byRoster.get(String(team.teamId))
      return entry ? { ...team, roster: overlay(team.roster, entry) } : team
    }),
    matchup,
    liveAt: at
  }
}

/**
 * The dashboard's leagues with the newest live answer applied to each Sleeper
 * league. An answer for another week, or older than the published data, is left out.
 */
export function withLive(data, live) {
  const published = Date.parse(data?.generatedAt) || 0
  return (data?.leagues || []).map((league) => {
    const snapshot = live?.[league.id]
    if (!snapshot || snapshot.week !== data.week || snapshot.at <= published) return league
    return applyLive(league, snapshot.entries, snapshot.at, data.week)
  })
}

/**
 * Asks Sleeper for the week's matchups in every Sleeper league while the app is
 * on screen. Returns league id to { entries, at, week }, the latest answer for
 * each. A failed request keeps the answer before it.
 */
export function useLive(data, visible, now) {
  const [live, setLive] = useState({})
  const week = data?.week || null
  const ids = (data?.leagues || []).map(sleeperId).filter(Boolean).join(',')
  const every = liveInterval(data?.schedule, now)

  useEffect(() => {
    if (!visible || !week || !ids) return undefined
    let stopped = false
    const poll = () => {
      for (const id of ids.split(',')) {
        fetch(`${BASE}/league/${id}/matchups/${week}`, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((entries) => {
            if (stopped || !Array.isArray(entries) || entries.length === 0) return
            setLive((current) => ({ ...current, [`sleeper:${id}`]: { entries, at: Date.now(), week } }))
          })
          .catch(() => {
            // Offline or blocked. The published data and the last answer stand.
          })
      }
    }
    poll()
    const timer = setInterval(poll, every)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [visible, week, ids, every])

  return live
}
