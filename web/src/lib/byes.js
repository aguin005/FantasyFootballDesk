import { bestAssignment, canFill, injuryLevel, isLocked, isReserve, slotOf, sortBySlot } from './lineup.js'
import { formatPoints, kickoffLabel } from './format.js'
import { shortName } from './nflSchedule.js'
import { teamCode } from './teams.js'
import { matchupGrade, rankPhrase } from './opponent.js'

/**
 * Bye weeks: which of your players sit out in the weeks ahead, and who plays
 * instead.
 *
 * A starter's bye is covered from your bench first. A free agent who plays that
 * week takes over when nobody on the bench can fill the slot, or when they
 * project clearly higher, since a pickup costs a claim and a roster spot. Each
 * pickup names the bench player to drop for it, unless a roster spot is open.
 *
 * Starters are the players in your current lineup. This week's bench choice is
 * the one start and sit makes, so the two never disagree. Picks cover this week
 * and the next two. Weeks after that list who is out and flag any slot your bench
 * cannot fill, without picks, since projections that far out are rough.
 */

export const LOOKAHEAD = 3
export const LAST_WEEK = 18
// How many more points a free agent has to project than your bench option.
export const CLEAR_GAIN = 3
// Covering a starter at all comes before covering them well.
const URGENT = 1e6

/** The week a player's team is on bye, or null when it is unknown or they have no team. */
export function byeWeekOf(player, byeWeeks) {
  if (!player?.team || player.team === 'FA') return null
  return byeWeeks?.[teamCode(player.team)] ?? null
}

/** A player's projection, game and matchup in a given week. */
function weekOf(player, week, current) {
  if (week === current) {
    return { projected: player.projected ?? null, game: player.game || null, opponentDefense: player.opponentDefense || null }
  }
  return player.ahead?.[week] || { projected: null, game: null, opponentDefense: null }
}

function started(game, now) {
  const kickoff = Date.parse(game?.kickoffISO)
  return Number.isFinite(kickoff) && now >= kickoff
}

/**
 * Every week from this one on where one of your players is on bye, with the plan
 * for each starter. Null when the bye weeks did not load.
 */
export function byeReport(league, report, byeWeeks, current, now = Date.now()) {
  if (!league || !byeWeeks || Object.keys(byeWeeks).length === 0 || !current) return null
  const active = league.roster.filter((player) => !isReserve(player))

  const canPlay = (player, week) =>
    player.team !== 'FA' && byeWeekOf(player, byeWeeks) !== week && injuryLevel(player.injuryStatus) < 3

  /** Starter id to the bench player who covers them that week. */
  const benchCover = (out, week, planned) => {
    if (week === current && report) {
      return new Map(report.swaps.map((swap) => [swap.starter.playerId, swap.replacement]))
    }
    const bench = active.filter((player) => !player.starter && canPlay(player, week))
    // Past the window there are no weekly projections, so the season total decides.
    const points = (player) => (planned ? weekOf(player, week, current).projected : player.seasonProjected) ?? 0
    const picks = bestAssignment(out, bench, (starter, candidate) =>
      canFill(slotOf(starter), candidate) ? URGENT + points(candidate) : null
    )
    return new Map(picks.map(([starter, candidate]) => [starter.playerId, candidate]))
  }

  const weeks = []
  for (let week = current; week <= LAST_WEEK; week++) {
    const resting = active.filter((player) => byeWeekOf(player, byeWeeks) === week)
    if (resting.length === 0) continue
    const offset = week - current
    const planned = offset < LOOKAHEAD
    const out = sortBySlot(resting.filter((player) => player.starter))
    const covers = benchCover(out, week, planned)
    weeks.push({
      week,
      offset,
      planned,
      stacked: out.length >= 3,
      benched: resting.filter((player) => !player.starter),
      out: planned
        ? pickups(out, covers, league.byeOptions?.[week] || [], week, current, now)
        : out.map((player) => {
            const bench = covers.get(player.playerId)
            return { player, slot: slotOf(player), bench: bench ? { player: bench } : null, needed: !bench }
          })
    })
  }

  suggestDrops(weeks, active, league.rosterSpots)
  return { current, weeks }
}

/**
 * Who plays for each starter in a planned week. Starters nobody on the bench can
 * cover choose first, since they need a free agent most, and no free agent is
 * named twice in one week.
 */
function pickups(out, covers, options, week, current, now) {
  const pool = options
    .filter((option) => week !== current || !started(option.game, now))
    .sort((a, b) => b.projected - a.projected)
  const used = new Set()
  const plans = new Map()
  const order = [...out].sort((a, b) => Number(covers.has(a.playerId)) - Number(covers.has(b.playerId)))

  for (const player of order) {
    const slot = slotOf(player)
    const cover = covers.get(player.playerId)
    const bench = cover ? { player: cover, ...weekOf(cover, week, current) } : null
    const best = pool.find((option) => !used.has(option.player.playerId) && canFill(slot, option.player)) || null
    const worth = Boolean(best) && (!bench || best.projected - (bench.projected ?? 0) >= CLEAR_GAIN)
    if (worth) used.add(best.player.playerId)
    plans.set(player.playerId, {
      player,
      slot,
      bench,
      pickup: worth ? best : null,
      // The best free agent when the bench is the better call, for comparison.
      freeAgent: worth ? null : best,
      needed: !bench
    })
  }
  return out.map((player) => plans.get(player.playerId))
}

/**
 * The bench player to let go for each pickup, week by week, or a note that a
 * spot is open. Anyone covering a bye in one of these weeks is kept. Players the
 * plan does not mention go before the fallbacks behind a pickup, and the lowest
 * season projection goes first. Nobody is named twice, since once dropped they
 * are gone for the weeks after too.
 */
function suggestDrops(weeks, active, rosterSpots) {
  const entries = weeks.filter((week) => week.planned).flatMap((week) => week.out)
  const keep = new Set(entries.filter((entry) => entry.bench && !entry.pickup).map((entry) => entry.bench.player.playerId))
  const fallback = new Set(entries.filter((entry) => entry.bench && entry.pickup).map((entry) => entry.bench.player.playerId))
  let open = rosterSpots ? Math.max(0, rosterSpots - active.length) : 0
  const dropped = new Set()
  const byRank = (a, b) =>
    Number(fallback.has(a.playerId)) - Number(fallback.has(b.playerId)) ||
    (a.seasonProjected ?? 0) - (b.seasonProjected ?? 0) ||
    (a.projected ?? 0) - (b.projected ?? 0)
  // A fallback named as a drop, here or in an earlier week, is no longer an option.
  const markDropped = (entry) => {
    if (entry.bench && dropped.has(entry.bench.player.playerId)) entry.bench = { ...entry.bench, dropped: true }
  }

  for (const entry of entries) {
    if (!entry.pickup) continue
    markDropped(entry)
    if (open > 0) {
      open--
      entry.openSpot = true
      continue
    }
    const drop = active
      .filter((player) => !player.starter && !keep.has(player.playerId) && !dropped.has(player.playerId))
      .sort(byRank)[0]
    if (drop) {
      dropped.add(drop.playerId)
      entry.drop = drop
      markDropped(entry)
    }
  }
}

/** The plan for one of your starters in a given week, or null. */
export function coverFor(byes, playerId, offset = 0) {
  const week = byes?.weeks.find((entry) => entry.offset === offset)
  return week?.out.find((entry) => entry.player.playerId === playerId) || null
}

/** "This week", "Next week", or "In 2 weeks". */
export function whenLabel(week) {
  if (week.offset === 0) return 'This week'
  if (week.offset === 1) return 'Next week'
  return `In ${week.offset} weeks`
}

function projectedText(line) {
  return line?.projected != null ? `, ${formatPoints(line.projected)} projected` : ''
}

/** What to do about one starter's bye, in a sentence. */
export function coverLine(entry) {
  if (entry.pickup) return `Pick up ${entry.pickup.player.name}${projectedText(entry.pickup)}`
  if (entry.bench) return `Start ${entry.bench.player.name} from your bench${projectedText(entry.bench)}`
  return `Nobody on your bench can play ${entry.slot}. Check waivers.`
}

/**
 * "NYJ · vs DEN · Sun 1:00 PM", for the player taking the slot. The card's slot
 * tag already says the position, and a phone has no room to say it twice.
 */
export function playLine(line) {
  const { player, game } = line
  // No-break spaces keep "Thu 8:15 PM" together when the line wraps.
  const when = game ? kickoffLabel(game).replace(/ /g, '\u00a0') : null
  return [player.team, game ? `${game.matchup} · ${when}` : null].filter(Boolean).join(' · ')
}

/**
 * The matchup the replacement has that week: how the opponent defends the
 * position, and the betting line once books post it, usually a week ahead.
 */
export function matchupLines(line) {
  const { player, game, opponentDefense: defense } = line
  const lines = []
  if (defense) {
    lines.push({
      text: `${defense.opponent} allow ${rankPhrase(defense)} points to ${player.position}s`,
      grade: matchupGrade(defense)
    })
  }
  if (game?.teamImplied != null) {
    lines.push({
      text:
        player.position === 'DEF'
          ? `${game.opponent} expected to score ${formatPoints(game.opponentImplied)}`
          : `${teamCode(player.team)} expected to score ${formatPoints(game.teamImplied)}`
    })
  }
  return lines
}

/** What else to know about a pickup or a bench choice, one line each. */
export function planNotes(entry) {
  const notes = []
  if (entry.pickup) {
    if (entry.openSpot) notes.push('You have an open roster spot for this pickup')
    else if (entry.drop) notes.push(`Drop ${entry.drop.name} to make room`)
    else notes.push('No spare bench player is left to drop, so choose one yourself')
    if (!entry.bench) notes.push(`Nobody on your bench can play ${entry.slot}`)
    else if (!entry.bench.dropped) notes.push(`Or start ${entry.bench.player.name} from your bench${projectedText(entry.bench)}`)
  } else if (entry.bench && entry.freeAgent) {
    notes.push(`Best free agent: ${entry.freeAgent.player.name}${projectedText(entry.freeAgent)}`)
  } else if (!entry.bench) {
    notes.push(`Nobody on your bench can play ${entry.slot}, and no free agent with a projection plays that week`)
  }
  return notes
}

/** "J. Chase, D. Henry", for a week further out. */
export function namesLine(players) {
  return players.map(shortName).join(', ')
}

/**
 * For the player sheet: when this player's bye is, or was. Null in the bye week
 * itself, which the sheet's game line already says.
 */
export function byeLine(player, byeWeeks, current) {
  const week = byeWeekOf(player, byeWeeks)
  if (week == null || !current || week === current) return null
  if (week === current + 1) return `On bye next week, week ${week}`
  if (week > current) return `Bye in week ${week}`
  return `Bye week ${week} has passed`
}
