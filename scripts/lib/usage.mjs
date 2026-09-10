import fs from 'node:fs/promises'
import path from 'node:path'
import { parseCSV, toNumber } from './csv.mjs'

const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download'
const CACHE_DIR = path.resolve('.cache')
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Projections are backward looking. A running back who took over a starting job on
 * Sunday still carries a backup's projection on Wednesday, which is exactly the
 * window where a waiver claim is cheap. Snap share, target share, and depth chart
 * rank move first, so they are what this module adds.
 *
 * Everything keys to ESPN player ids, since that is what the rest of the project
 * already uses. nflverse ships a players file with espn_id, pfr_id, and gsis_id on
 * every row, which is the join.
 */
export async function loadUsage(season) {
  try {
    const players = await loadCSV('players/players.csv', 'nflverse players')
    const idMap = buildIdMap(players)

    const [weekly, snaps, depth] = await Promise.all([
      loadSeasonCSV('stats_player', `stats_player_week_${season}.csv`, season),
      loadSeasonCSV('snap_counts', `snap_counts_${season}.csv`, season),
      loadSeasonCSV('depth_charts', `depth_charts_${season}.csv`, season)
    ])

    const stale = weekly.usedSeason !== season || snaps.usedSeason !== season

    const usage = new Map()
    applyTargets(usage, weekly.rows, idMap.byGsis, stale)
    applySnaps(usage, snaps.rows, idMap.byPfr, stale)
    applyDepth(usage, depth.rows)
    if (stale) {
      console.log(
        `No ${season} game data published yet, so snap and target share come from ${weekly.usedSeason}.`
      )
      for (const entry of usage.values()) {
        if (entry.snapPct != null || entry.targetShare != null) entry.stale = true
      }
    }

    console.log(`Usage data covers ${usage.size} players`)
    return usage
  } catch (error) {
    console.warn(`nflverse usage data unavailable: ${error.message}`)
    return new Map()
  }
}

function buildIdMap(players) {
  const byGsis = new Map()
  const byPfr = new Map()
  for (const player of players) {
    if (!player.espn_id) continue
    const espnId = String(player.espn_id).replace(/\.0$/, '')
    if (player.gsis_id) byGsis.set(player.gsis_id, espnId)
    if (player.pfr_id) byPfr.set(player.pfr_id, espnId)
  }
  return { byGsis, byPfr }
}

function entryFor(usage, espnId) {
  if (!usage.has(espnId)) {
    usage.set(espnId, {
      snapPct: null,
      snapTrend: null,
      targetShare: null,
      targetTrend: null,
      passRole: null,
      touchesPerGame: null,
      depthRank: null,
      depthPosition: null,
      stale: false
    })
  }
  return usage.get(espnId)
}

/** Latest week against the average of the three before it, which is where role changes show. */
function applyTargets(usage, rows, byGsis, stale) {
  const byPlayer = groupByPlayer(rows, (row) => byGsis.get(row.player_id))
  for (const [espnId, weeks] of byPlayer) {
    const shares = weeks.map((row) => toNumber(row.target_share)).filter((value) => value != null)
    if (shares.length === 0) continue
    const entry = entryFor(usage, espnId)
    entry.targetShare = round(headline(shares, stale) * 100)
    entry.targetTrend = stale ? null : trend(shares)
    applyRole(entry, weeks)
  }
}

/**
 * Routes run is the number that separates a passing down back from a two down
 * back, and it is not in any free dataset. nflverse carries no routes column, and
 * PFF and Fantasy Points Data both sell it.
 *
 * The share of a player's touches that arrive through the air is the closest free
 * substitute. A back at 40% is catching passes; a back at 5% is taking handoffs and
 * leaving on third down, which is the distinction that matters for PPR.
 */
function applyRole(entry, weeks) {
  const recent = weeks.slice(-4)
  let targets = 0
  let carries = 0
  for (const row of recent) {
    targets += toNumber(row.targets) ?? 0
    carries += toNumber(row.carries) ?? 0
  }
  const touches = targets + carries
  if (touches < 8) return
  entry.passRole = round((targets / touches) * 100)
  entry.touchesPerGame = round(touches / recent.length)
}

function applySnaps(usage, rows, byPfr, stale) {
  const byPlayer = groupByPlayer(rows, (row) => byPfr.get(row.pfr_player_id))
  for (const [espnId, weeks] of byPlayer) {
    const pcts = weeks.map((row) => toNumber(row.offense_pct)).filter((value) => value != null)
    if (pcts.length === 0) continue
    const entry = entryFor(usage, espnId)
    entry.snapPct = round(headline(pcts, stale) * 100)
    entry.snapTrend = stale ? null : trend(pcts)
  }
}

/**
 * In season the latest week is the story. Out of season a single final week is
 * noise, since rested starters and eliminated teams distort it, so the closing
 * four week average is the more honest number.
 */
function headline(values, stale) {
  if (!stale) return values[values.length - 1]
  const window = values.slice(-4)
  return window.reduce((sum, value) => sum + value, 0) / window.length
}

/**
 * Depth charts are published before week one, which makes them the only role signal
 * that exists in September. pos_rank 1 is the starter at that spot.
 */
function applyDepth(usage, rows) {
  const latest = new Map()
  for (const row of rows) {
    if (!row.espn_id) continue
    // Depth charts cover the whole roster. Only fantasy positions matter here.
    if (!FANTASY_DEPTH_POSITIONS.has(row.pos_abb)) continue
    const espnId = String(row.espn_id).replace(/\.0$/, '')
    const rank = toNumber(row.pos_rank)
    if (rank == null) continue
    const stamp = row.dt || ''
    const existing = latest.get(espnId)
    if (!existing || stamp >= existing.stamp) {
      latest.set(espnId, { stamp, rank, position: row.pos_abb || row.pos_name })
    }
  }
  for (const [espnId, record] of latest) {
    const entry = entryFor(usage, espnId)
    entry.depthRank = record.rank
    entry.depthPosition = record.position
  }
}

const FANTASY_DEPTH_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'PK'])

function groupByPlayer(rows, resolveId) {
  const byPlayer = new Map()
  for (const row of rows) {
    const espnId = resolveId(row)
    if (!espnId) continue
    if (!byPlayer.has(espnId)) byPlayer.set(espnId, [])
    byPlayer.get(espnId).push(row)
  }
  for (const weeks of byPlayer.values()) {
    weeks.sort((a, b) => toNumber(a.week) - toNumber(b.week))
  }
  return byPlayer
}

function trend(values) {
  if (values.length < 2) return null
  const latest = values[values.length - 1]
  const priorWindow = values.slice(Math.max(0, values.length - 4), values.length - 1)
  const priorAverage = priorWindow.reduce((sum, value) => sum + value, 0) / priorWindow.length
  return round((latest - priorAverage) * 100)
}

function round(value) {
  return value == null ? null : Number(value.toFixed(1))
}

/** Falls back to last season when this season's file does not exist yet. */
async function loadSeasonCSV(tag, filename, season) {
  try {
    return { rows: await loadCSV(`${tag}/${filename}`, filename), usedSeason: season }
  } catch (error) {
    const previous = Number(season) - 1
    const fallback = filename.replace(String(season), String(previous))
    const rows = await loadCSV(`${tag}/${fallback}`, fallback)
    return { rows, usedSeason: previous }
  }
}

async function loadCSV(assetPath, label) {
  const cacheKey = path.join(CACHE_DIR, `nflverse-${assetPath.replace(/\//g, '-')}`)

  try {
    const stat = await fs.stat(cacheKey)
    if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
      return parseCSV(await fs.readFile(cacheKey, 'utf8'))
    }
  } catch {
    // No cache yet.
  }

  const response = await fetch(`${RELEASES}/${assetPath}`, {
    headers: { 'user-agent': 'fantasy-dashboard/1.0 (personal use)' }
  })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)

  const text = await response.text()
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(cacheKey, text)
  return parseCSV(text)
}

/** Human readable notes for the dashboard, only when the numbers say something. */
export function usageNotes(entry) {
  if (!entry) return []
  const notes = []
  const suffix = entry.stale ? ' last season' : ''

  // A zero here means the player did not take a snap, which is not worth a line.
  if (entry.snapPct > 0) {
    const direction =
      entry.snapTrend > 4 ? ', trending up' : entry.snapTrend < -4 ? ', trending down' : ''
    notes.push(`Played ${entry.snapPct}% of snaps${suffix}${direction}`)
  }
  if (entry.targetShare > 0) {
    notes.push(`Saw ${entry.targetShare}% of targets${suffix}`)
  }
  if (entry.passRole != null && entry.touchesPerGame >= 4) {
    const shape =
      entry.passRole >= 40
        ? 'mostly through the air'
        : entry.passRole <= 12
          ? 'almost entirely on handoffs'
          : 'split between carries and targets'
    notes.push(`${entry.touchesPerGame} touches a game${suffix}, ${shape}`)
  }
  if (entry.depthRank === 1) {
    notes.push(`Listed first on the depth chart at ${entry.depthPosition}`)
  } else if (entry.depthRank === 2) {
    notes.push(`Listed second at ${entry.depthPosition}`)
  }
  return notes
}
