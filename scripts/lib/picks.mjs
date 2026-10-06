import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizeTeam } from './schedule.mjs'
import { headshot } from './images.mjs'

/**
 * Whether the app's waiver picks were any good.
 *
 * Each week the top of the waiver board is locked in at the week's first kickoff,
 * and after every week that follows, each pick's points are set against your
 * lowest scoring starter at the same position. That is the claim the waiver model
 * makes, that this player would score more than someone you are starting.
 *
 * Both sides are scored from Sleeper's weekly stats in the league's own points per
 * catch, so the comparison is fair even where a league's custom rules would move
 * both numbers a little. The history lives in one small JSON file that the
 * workflow keeps on its own branch, so main never gets data commits.
 */

export const PICKS_PER_WEEK = 3
// Refreshes come every ten minutes around kickoff, so a board from the first hour
// after it is as good as the one before. A later board has seen games played.
const LATE_LOCK_MS = 60 * 60 * 1000
export const HISTORY_FILE = path.resolve(process.env.PICK_HISTORY || '.history/picks.json')

// Sleeper names Washington's defense WAS, where the schedule and ESPN use WSH.
const SLEEPER_DEFENSE = { WSH: 'WAS' }

/**
 * The history on file, a fresh one when there is none or a new season has begun,
 * or null when the file exists but cannot be read. Null means skip tracking this
 * run: starting over would replace the saved record with an empty one.
 */
export async function readHistory(season, file = HISTORY_FILE) {
  const fresh = { version: 1, season: String(season), leagues: {} }
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return fresh
  }
  try {
    const history = JSON.parse(text)
    if (history.version !== 1 || typeof history.leagues !== 'object') throw new Error('unknown format')
    return String(history.season) === String(season) ? history : fresh
  } catch (error) {
    console.warn(`Pick history unreadable, leaving it untouched this run: ${error.message}`)
    return null
  }
}

export async function writeHistory(history, file = HISTORY_FILE) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(history, null, 2)}\n`)
}

function entryFor(history, league) {
  history.leagues[league.id] ||= { picks: {}, weeks: {} }
  return history.leagues[league.id]
}

/**
 * The id Sleeper's stats and projections use for a player in either kind of
 * league. A Sleeper league already uses Sleeper ids, an ESPN league carries them
 * from the crosswalk, and defenses are keyed by team.
 */
export function statsId(player, platform) {
  if (player.position === 'DEF') {
    const team = normalizeTeam(player.team)
    return SLEEPER_DEFENSE[team] || team
  }
  return platform === 'sleeper' ? player.playerId : player.sleeperId || null
}

function pickRecord(player, platform, lockedAt) {
  return {
    playerId: player.playerId,
    statsId: statsId(player, platform),
    espnId: player.espnId || null,
    sleeperId: player.sleeperId || (platform === 'sleeper' ? player.playerId : null),
    name: player.name,
    position: player.position,
    team: player.team,
    score: player.score ?? null,
    projected: player.projected ?? null,
    reason: player.reasons?.[0] || null,
    lockedAt
  }
}

/**
 * Locks this week's picks once its first game has kicked off. The board graded is
 * the one from just before kickoff, the last thing the app recommended, so the
 * copy published by the previous run is used when it is from before kickoff.
 * Without one, the current board stands in only during the first hour. After
 * that it has seen games, and grading it on the same week would credit the picks
 * with hindsight, so the week is skipped. That happens when the app is set up
 * mid week or the refresh was down over kickoff. Returns the names of the
 * leagues that were locked.
 */
export function lockPicks(history, leagues, previous, week, firstKickoff, now = Date.now()) {
  if (!Number.isFinite(firstKickoff) || now < firstKickoff) return []
  const before = previous?.week === week && Date.parse(previous.generatedAt) < firstKickoff ? previous : null
  const late = now > firstKickoff + LATE_LOCK_MS
  const locked = []
  for (const league of leagues) {
    const entry = entryFor(history, league)
    if (entry.picks[week]) continue
    const earlier = before?.leagues?.find((candidate) => candidate.id === league.id)
    const pre = earlier?.waivers?.length ? earlier.waivers : null
    if (!pre && late) continue
    const board = pre || league.waivers || []
    if (board.length === 0) continue
    const lockedAt = new Date(pre ? Date.parse(before.generatedAt) : now).toISOString()
    entry.picks[week] = board.slice(0, PICKS_PER_WEEK).map((player) => pickRecord(player, league.platform, lockedAt))
    locked.push(league.name)
  }
  return locked
}

/**
 * Finished weeks that still need recording for this league: every week from its
 * first locked pick through the last finished week.
 */
export function weeksToRecord(history, league, lastFinished) {
  const entry = history.leagues[league.id]
  if (!entry) return []
  const first = Math.min(...Object.keys(entry.picks).map(Number))
  const weeks = []
  for (let week = first; week <= lastFinished; week++) {
    if (!entry.weeks[week]) weeks.push(week)
  }
  return weeks
}

/**
 * Records one finished week for a league: the points of every pick still being
 * followed and of your starters, all from the same stats. Starters without a
 * stats id are left out rather than counted as zero, which would make any pick
 * look good. Returns false when the stats are missing, so the week is retried.
 */
export function recordWeek(history, league, week, { starters, stats, key, byes }) {
  if (!stats?.size || !starters) return false
  const entry = entryFor(history, league)
  const points = (id) => Number((stats.get(id)?.[key] ?? 0).toFixed(2))

  const tracked = Object.entries(entry.picks)
    .filter(([pickWeek]) => Number(pickWeek) <= week)
    .flatMap(([, picks]) => picks)
  const scored = {}
  for (const pick of tracked) {
    if (pick.statsId) scored[pick.statsId] = points(pick.statsId)
  }

  entry.weeks[week] = {
    points: scored,
    starters: starters
      .filter((player) => player.statsId)
      .map((player) => ({
        statsId: player.statsId,
        name: player.name,
        position: player.position,
        points: points(player.statsId)
      })),
    byes
  }
  return true
}

/**
 * Every locked week, newest first, with each pick graded against your lowest
 * scoring starter at the position in every recorded week since. A bye week is
 * skipped. A week without stats for a pick that was not on bye counts as zero,
 * since a player who did not play would have scored nothing for you.
 */
export function pickReport(history, league, nextLock = null) {
  const entry = history.leagues[league.id]
  const locked = entry ? Object.keys(entry.picks).map(Number) : []
  if (locked.length === 0) return nextLock ? { weeks: [], summary: { beat: 0, graded: 0 }, nextLock } : null

  const recorded = Object.keys(entry.weeks)
    .map(Number)
    .sort((a, b) => a - b)

  const weeks = locked
    .sort((a, b) => b - a)
    .map((week) => ({
      week,
      picks: entry.picks[week].map((pick) => grade(pick, week, entry.weeks, recorded))
    }))

  const all = weeks.flatMap((week) => week.picks)
  return {
    weeks,
    summary: {
      beat: all.reduce((sum, pick) => sum + pick.beat, 0),
      graded: all.reduce((sum, pick) => sum + pick.graded, 0)
    },
    nextLock
  }
}

function grade(pick, from, weeks, recorded) {
  const results = recorded
    .filter((week) => week >= from)
    .map((week) => {
      const record = weeks[week]
      if ((record.byes || []).includes(normalizeTeam(pick.team))) return { week, bye: true }
      const points = record.points[pick.statsId] ?? 0
      // Your own copy of the pick does not count as the starter to beat.
      const rivals = record.starters.filter(
        (starter) => starter.position === pick.position && starter.statsId !== pick.statsId
      )
      const worst = rivals.reduce((low, starter) => (!low || starter.points < low.points ? starter : low), null)
      return {
        week,
        points,
        starter: worst ? { name: worst.name, points: worst.points } : null,
        beat: worst ? points > worst.points : null
      }
    })

  const played = results.filter((result) => !result.bye)
  const graded = played.filter((result) => result.beat != null)
  return {
    ...pick,
    image: headshot(pick),
    results,
    games: played.length,
    perGame: played.length ? Number((played.reduce((sum, result) => sum + result.points, 0) / played.length).toFixed(1)) : null,
    graded: graded.length,
    beat: graded.filter((result) => result.beat).length
  }
}
