import { bestAssignment, canFill, injuryLevel, isLocked, isReserve, scheduleKnown, sitReason, slotOf } from './lineup.js'
import { coverFor } from './byes.js'
import { formatPoints } from './format.js'
import { shortName } from './nflSchedule.js'
import { teamCode } from './teams.js'

/**
 * Matchup prep: your chance to win this week's matchup, what to do before kickoff
 * to raise it, and a scouting report on the team you face.
 *
 * The win chance treats each starter's score as a normal spread around where they
 * are headed. Each spread comes from that player's weekly scores when there are
 * enough of them, pulled toward a typical spread for the position, and shrinks as
 * their game is played. The two totals' spreads add, and the chance is the share
 * of outcomes where yours comes out ahead.
 *
 * The opponent is assumed to fix the obvious: a starter on bye, out, or doubtful
 * is replaced by their best bench player who can fill the slot, the same rule
 * start and sit applies to you. Your own lineup is taken as it is set, and each
 * move on the to-do list says how much it raises your chance. The underdog or
 * favorite tip is the exception, a judgment on range that the chance cannot price.
 */

// How much a typical starter's weekly score varies against their projection, by
// position. A receiver projected for 12 lands within about 8 points of it in two
// weeks of three.
const POSITION_SWING = { QB: 0.42, RB: 0.62, WR: 0.66, TE: 0.72, K: 0.5, DEF: 0.8 }
// A player's own games count as much as this many games of the position's spread,
// so a few odd weeks do not swamp it.
const PRIOR_GAMES = 4
// A free agent has to project this much more than the starter they would replace.
export const CLEAR_GAIN = 3
// Underdog and favorite advice only swaps players projected this close together,
// and only for a clear difference in how high or low they usually score. A spread
// model barely moves the win chance for a swap like that, since it treats scores
// as symmetric, so this is a ceiling and floor rule rather than a chance.
const SWING_GAP = 2
const CEILING_EDGE = 4
const FLOOR_EDGE = 3
// Below this chance you are the underdog, above the second the favorite.
const UNDERDOG = 0.45
const FAVORITE = 0.55

/** How far one player's score usually lands from where they are headed. */
export function spreadOf(player) {
  const prior = POSITION_SWING[player.position] ?? 0.65
  const swing = player.swing
  let share = prior
  if (swing?.games >= 3 && swing.mean >= 3) {
    const observed = swing.sd / swing.mean
    share = (swing.games * observed + PRIOR_GAMES * prior) / (swing.games + PRIOR_GAMES)
  }
  share = Math.min(1.1, Math.max(0.3, share))
  return Math.max(1, share * Math.max(0, player.projected ?? 0))
}

/** The chance a normal variable with this mean and variance comes out above zero. */
export function chanceAbove(mean, variance) {
  if (variance <= 0) return mean > 0 ? 1 : mean < 0 ? 0 : 0.5
  return normalCdf(mean / Math.sqrt(variance))
}

function normalCdf(z) {
  // Abramowitz and Stegun 7.1.26, accurate to about 1e-7.
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** A row for a player moved into a slot before their game: headed for their projection. */
function freshRow(player, slot) {
  return { player, slot, expected: player.projected ?? 0, remaining: 1 }
}

/** The slot a row fills, which a player moved in from the bench does not carry. */
function rowSlot(row) {
  return row.slot || slotOf(row.player)
}

function total(rows) {
  let mean = 0
  let variance = 0
  for (const row of rows) {
    mean += row.expected
    variance += row.remaining * spreadOf(row.player) ** 2
  }
  return { mean, variance }
}

/** Your chance to win with these two lineups. */
export function winChance(mine, theirs) {
  const me = total(mine)
  const them = total(theirs)
  return chanceAbove(me.mean - them.mean, me.variance + them.variance)
}

function replaceRow(rows, outId, player) {
  return rows.map((row) => (row.player.playerId === outId ? freshRow(player, rowSlot(row)) : row))
}

/**
 * The lineup the opponent will most likely play: each starter who will sit, and
 * whose game has not started, swapped for their best bench player at the slot.
 */
export function likelyLineup(rows, roster, now = Date.now()) {
  const known = scheduleKnown(roster)
  const sitting = rows.filter((row) => !isLocked(row.player, now) && sitReason(row.player, known))
  const bench = roster.filter(
    (player) => !player.starter && !isReserve(player) && !isLocked(player, now) && !sitReason(player, known)
  )
  const picks = bestAssignment(
    sitting.map((row) => row.player),
    bench,
    (starter, candidate) => (canFill(slotOf(starter), candidate) ? 1000 + (candidate.projected ?? 0) : null)
  )
  const covered = new Map(picks.map(([starter, replacement]) => [starter.playerId, replacement]))
  const swaps = sitting.map((row) => ({
    starter: row.player,
    slot: slotOf(row.player),
    reason: sitReason(row.player, known),
    replacement: covered.get(row.player.playerId) || null
  }))
  let lineup = rows
  for (const swap of swaps) {
    if (swap.replacement) lineup = replaceRow(lineup, swap.starter.playerId, swap.replacement)
  }
  return { rows: lineup, swaps }
}

/**
 * Everything matchup prep shows, or null when there is no matchup or it is over.
 * report is start and sit's lineup report and byes the bye planner's, so the to-do
 * list names the same moves those views do.
 */
export function prepReport(league, matchup, report, byes, now = Date.now()) {
  if (!league || !matchup || matchup.final || !report) return null
  const opponent = (league.teams || []).find((team) => String(team.teamId) === String(matchup.opponentTeamId))
  if (!opponent) return null

  const likely = likelyLineup(matchup.them.rows, opponent.roster, now)
  const theirs = likely.rows
  const chance = winChance(matchup.me.rows, theirs)

  const items = []
  let mine = matchup.me.rows
  let current = chance
  const used = new Set()
  const apply = (item, outId, player) => {
    mine = replaceRow(mine, outId, player)
    const next = winChance(mine, theirs)
    item.gain = next - current
    current = next
    used.add(player.playerId)
    used.add(outId)
    items.push(item)
  }

  // 1. Start and sit's swaps, so both views ask for the same thing.
  for (const swap of report.swaps) {
    apply(
      { kind: 'start', player: swap.replacement, over: swap.starter, reason: swap.reason, points: swap.gain },
      swap.starter.playerId,
      swap.replacement
    )
  }

  // 2. Starters who will sit with nobody on the bench to cover them: the bye
  // planner's pickup for a bye, otherwise the best free agent who can play.
  // A bye pickup keeps the drop the bye planner named, so the two never disagree.
  const pickups = []
  let spotsTaken = 0
  for (const { starter, reason } of report.stranded) {
    const slot = slotOf(starter)
    const plan = reason === 'bye' ? coverFor(byes, starter.playerId, 0) : null
    if (plan?.pickup) {
      const { player, projected, game } = plan.pickup
      const item = { kind: 'pickup', player: { ...player, projected, game }, over: starter, reason, slot }
      item.openSpot = Boolean(plan.openSpot)
      item.drop = plan.drop || null
      if (item.openSpot) spotsTaken++
      if (item.drop) used.add(item.drop.playerId)
      apply(item, starter.playerId, item.player)
      continue
    }
    const free = bestFreeAgent(league, slot, used, now)
    if (free) {
      const item = { kind: 'pickup', player: free, over: starter, reason, slot }
      apply(item, starter.playerId, free)
      pickups.push(item)
    } else {
      items.push({ kind: 'hole', over: starter, reason, slot, gain: null })
    }
  }

  // 3. Free agents who clearly beat a starter, two at most.
  for (const upgrade of upgrades(league, mine, used, now).slice(0, 2)) {
    const item = { kind: 'upgrade', player: upgrade.player, over: upgrade.over, points: upgrade.points }
    apply(item, upgrade.over.playerId, upgrade.player)
    pickups.push(item)
  }
  suggestDrops(league, pickups, used, byes, spotsTaken)

  // 4. Underdog or favorite, judged after the fixes above: a close call between a
  // starter and a bench player, settled by ceiling when behind and floor when ahead.
  const planned = current
  const status = planned < UNDERDOG ? 'underdog' : planned > FAVORITE ? 'favorite' : 'even'
  if (status !== 'even') {
    const swing = swingSwap(league, mine, used, status, now)
    if (swing) items.push({ kind: 'swing', status, gain: null, ...swing })
  }

  return {
    week: matchup.week,
    opponent: opponent.name,
    chance,
    planned: current,
    status,
    items,
    todo: items.length,
    theirSwaps: likely.swaps,
    // Both as each side will most likely play it: yours after the to-do list,
    // theirs after their likely swaps.
    myProjection: total(mine).mean,
    theirProjection: total(theirs).mean,
    edges: edges(mine, theirs),
    recent: recentForm(league, opponent),
    series: seasonSeries(league, opponent)
  }
}

function playable(player, used, now) {
  return (
    !used.has(player.playerId) &&
    player.game &&
    !isLocked(player, now) &&
    injuryLevel(player.injuryStatus) < 2 &&
    (player.projected ?? 0) > 0
  )
}

function bestFreeAgent(league, slot, used, now) {
  return (
    (league.waivers || [])
      .filter((player) => canFill(slot, player) && playable(player, used, now))
      .sort((a, b) => b.projected - a.projected)[0] || null
  )
}

/** Free agents projecting CLEAR_GAIN more than a starter they can replace, best first. */
function upgrades(league, rows, used, now) {
  const open = rows.filter((row) => !isLocked(row.player, now) && !used.has(row.player.playerId))
  const found = []
  const targeted = new Set()
  const options = (league.waivers || [])
    .filter((player) => playable(player, used, now))
    .sort((a, b) => b.projected - a.projected)
  for (const player of options) {
    const target = open
      .filter((row) => !targeted.has(row.player.playerId) && canFill(rowSlot(row), player))
      .sort((a, b) => a.expected - b.expected)[0]
    if (!target || player.projected - target.expected < CLEAR_GAIN) continue
    targeted.add(target.player.playerId)
    found.push({ player, over: target.player, points: player.projected - target.expected })
  }
  return found.sort((a, b) => b.points - a.points)
}

/**
 * Who to drop for each pickup: an open roster spot first, then the bench player
 * with the lowest season projection who is not part of the plan or covering a bye
 * in the next weeks.
 */
function suggestDrops(league, pickups, used, byes, spotsTaken) {
  const active = league.roster.filter((player) => !isReserve(player))
  let open = league.rosterSpots ? Math.max(0, league.rosterSpots - active.length - spotsTaken) : 0
  const covering = new Set(
    (byes?.weeks || [])
      .filter((week) => week.planned)
      .flatMap((week) => week.out)
      .filter((entry) => entry.bench && !entry.pickup)
      .map((entry) => entry.bench.player.playerId)
  )
  const spare = active
    .filter((player) => !player.starter && !used.has(player.playerId) && !covering.has(player.playerId))
    .sort((a, b) => (a.seasonProjected ?? 0) - (b.seasonProjected ?? 0) || (a.projected ?? 0) - (b.projected ?? 0))
  for (const item of pickups) {
    if (open > 0) {
      open--
      item.openSpot = true
    } else {
      item.drop = spare.shift() || null
    }
  }
}

/**
 * The bench player to start for their range rather than their projection: a
 * clearly higher ceiling when you are the underdog, a clearly higher floor when
 * you are favored. Both players need enough games for a real range. Null when no
 * pair qualifies.
 */
function swingSwap(league, rows, used, status, now) {
  const known = scheduleKnown(league.roster)
  const ranged = (player) => player.swing?.games >= 4 && player.projected != null
  const bench = league.roster.filter(
    (player) =>
      !player.starter &&
      !isReserve(player) &&
      !used.has(player.playerId) &&
      !isLocked(player, now) &&
      !sitReason(player, known) &&
      ranged(player)
  )
  let best = null
  for (const row of rows) {
    const starter = row.player
    if (used.has(starter.playerId) || isLocked(starter, now) || !ranged(starter)) continue
    for (const candidate of bench) {
      if (!canFill(rowSlot(row), candidate)) continue
      if (starter.projected - candidate.projected > SWING_GAP) continue
      const edge =
        status === 'underdog'
          ? candidate.swing.high - starter.swing.high
          : candidate.swing.low - starter.swing.low
      if (edge < (status === 'underdog' ? CEILING_EDGE : FLOOR_EDGE)) continue
      if (!best || edge > best.edge) best = { player: candidate, over: starter, edge }
    }
  }
  return best
}

/** The slots where one side clearly outprojects the other, two each way. */
function edges(mine, theirs) {
  const bySlot = (rows) => {
    const map = new Map()
    for (const row of rows) {
      const slot = rowSlot(row)
      if (!map.has(slot)) map.set(slot, [])
      map.get(slot).push(row)
    }
    return map
  }
  const theirSlots = bySlot(theirs)
  const pairs = []
  for (const [slot, rows] of bySlot(mine)) {
    const others = theirSlots.get(slot) || []
    rows.forEach((row, index) => {
      const other = others[index]
      if (!other) return
      pairs.push({ slot, mine: row.player, theirs: other.player, diff: row.expected - other.expected })
    })
  }
  const clear = pairs.filter((pair) => Math.abs(pair.diff) >= 1)
  return {
    mine: clear.filter((pair) => pair.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2),
    theirs: clear.filter((pair) => pair.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2)
  }
}

function gamesFor(league, teamId) {
  const names = new Map((league.teams || []).map((team) => [String(team.teamId), team.name]))
  return (league.results || [])
    .filter((game) => String(game.a) === String(teamId) || String(game.b) === String(teamId))
    .map((game) => {
      const home = String(game.a) === String(teamId)
      const points = home ? game.aPoints : game.bPoints
      const against = home ? game.bPoints : game.aPoints
      const opponentId = home ? game.b : game.a
      return {
        week: game.week,
        points,
        against,
        opponentId,
        opponent: names.get(String(opponentId)) || null,
        outcome: Math.abs(points - against) < 0.005 ? 'tied' : points > against ? 'won' : 'lost'
      }
    })
    .sort((a, b) => b.week - a.week)
}

/** Each side's last three scores and their average. */
function recentForm(league, opponent) {
  const me = (league.teams || []).find((team) => team.isMine)
  const form = (teamId) => {
    const games = teamId == null ? [] : gamesFor(league, teamId).slice(0, 3)
    return {
      games,
      average: games.length ? games.reduce((sum, game) => sum + game.points, 0) / games.length : null
    }
  }
  return { them: form(opponent.teamId), me: form(me?.teamId) }
}

/** Your earlier meetings with this opponent this season, oldest first. */
function seasonSeries(league, opponent) {
  const me = (league.teams || []).find((team) => team.isMine)
  if (!me) return []
  return gamesFor(league, me.teamId)
    .filter((game) => String(game.opponentId) === String(opponent.teamId))
    .reverse()
}

/** "62%", kept off 0 and 100 while anything is left to play. */
export function chanceLabel(chance) {
  return `${Math.min(99, Math.max(1, Math.round(chance * 100)))}%`
}

/** "+6%", or "<1%" for a move that barely changes it. */
export function gainLabel(gain) {
  if (gain == null) return null
  const points = Math.round(gain * 100)
  if (points >= 1) return `+${points}%`
  if (points <= -1) return `${points}%`
  return '<1%'
}

const SIT_WORDS = {
  bye: 'is on bye',
  noteam: 'has no NFL team',
  out: 'is out',
  doubtful: 'is doubtful'
}

/** The to-do item as one line. */
export function itemLine(item) {
  const name = (player) => (player.position === 'DEF' ? playerLabel(player) : player.name)
  if (item.kind === 'start') return `Start ${name(item.player)} over ${name(item.over)}`
  if (item.kind === 'pickup') return `Pick up ${name(item.player)} for ${name(item.over)}`
  if (item.kind === 'hole') return `Find a ${item.slot} for ${name(item.over)}`
  if (item.kind === 'upgrade') return `Pick up ${name(item.player)} to start over ${name(item.over)}`
  if (item.status === 'underdog') return `Take the swing: start ${name(item.player)} over ${name(item.over)}`
  return `Play it safe: start ${name(item.player)} over ${name(item.over)}`
}

/** "J. Chase", or "BUF D/ST" for a defense, which shortName leaves as just "D/ST". */
export function playerLabel(player) {
  // No-break spaces, so a name never splits across a line.
  return player.position === 'DEF' ? `${teamCode(player.team)}\u00a0D/ST` : shortName(player)
}

function rangeText(player) {
  const swing = player.swing
  return swing?.games >= 4 ? `${formatPoints(swing.low)} to ${formatPoints(swing.high)}` : null
}

function dropText(item) {
  if (item.openSpot) return 'You have an open roster spot'
  if (item.drop) return `Drop ${item.drop.name} to make room`
  return 'Choose a bench player to drop'
}

/** Why, in a sentence or two. */
export function itemNote(item) {
  const over = item.over && playerLabel(item.over)
  if (item.kind === 'start') {
    if (item.reason !== 'upgrade') return `${over} ${SIT_WORDS[item.reason]}.`
    return `Projects ${formatPoints(item.points)} more than ${over}.`
  }
  if (item.kind === 'pickup') {
    return `${over} ${SIT_WORDS[item.reason]} and nobody on your bench can play ${item.slot}. ${dropText(item)}.`
  }
  if (item.kind === 'hole') {
    return `${over} ${SIT_WORDS[item.reason]}, nobody on your bench can play ${item.slot}, and no free agent with a projection does either.`
  }
  if (item.kind === 'upgrade') {
    return `Projects ${formatPoints(item.points)} more than ${over}. ${dropText(item)}.`
  }
  const ranges = `${playerLabel(item.player)} usually scores ${rangeText(item.player)}, ${over} ${rangeText(item.over)}.`
  return item.status === 'underdog'
    ? `You're the underdog, so a higher ceiling is worth more than a point or two of projection. ${ranges}`
    : `You're favored, so a safer floor is worth more than a point or two of projection. ${ranges}`
}

/** "Kelce is on bye, so they'll likely start Likely." */
export function swapLine(swap) {
  const starter = playerLabel(swap.starter)
  if (!swap.replacement) return `${starter} ${SIT_WORDS[swap.reason]}, and nobody on their bench can play ${swap.slot}`
  return `${starter} ${SIT_WORDS[swap.reason]}, so they'll likely start ${playerLabel(swap.replacement)}`
}
