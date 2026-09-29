/**
 * Lineup logic shared by the Today, Lineup, and player views.
 *
 * Kept free of React so the rules live in one place: which bench player can fill
 * which slot, which games are locked, and which swaps are worth making.
 */

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export const SLOT_ORDER = [
  'QB', 'RB', 'WR', 'TE', 'FLEX', 'W/R', 'RB/WR', 'W/T', 'WR/TE', 'SFLEX', 'OP', 'K', 'DEF',
  'BE', 'TAXI', 'IR'
]

// Every flex style slot either platform can configure, and who may fill it.
const FLEX_SLOTS = {
  FLEX: ['RB', 'WR', 'TE'],
  'W/R': ['RB', 'WR'],
  'RB/WR': ['RB', 'WR'],
  'W/T': ['WR', 'TE'],
  'WR/TE': ['WR', 'TE'],
  SFLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE']
}

const RESERVE_SLOTS = new Set(['IR', 'TAXI'])

// Projections are not precise enough for a smaller gap to mean anything.
export const MIN_GAIN = 1

// Kickoff to final whistle, with room for overtime. There are no live scores in the
// data, so a game counts as played once this much time has passed since kickoff.
const GAME_WINDOW_MS = 3.5 * 60 * 60 * 1000

const OUT_STATUSES = new Set(['OUT', 'IR', 'SUSPENDED', 'SUSPENSION', 'PUP', 'NFI', 'COV'])

const INJURY_LABELS = {
  QUESTIONABLE: ['Q', 'Questionable'],
  DOUBTFUL: ['D', 'Doubtful'],
  OUT: ['OUT', 'Out'],
  IR: ['IR', 'Injured reserve'],
  SUSPENDED: ['SUS', 'Suspended'],
  SUSPENSION: ['SUS', 'Suspended'],
  PUP: ['PUP', 'Physically unable to perform'],
  NFI: ['NFI', 'Non-football injury'],
  COV: ['COV', 'COVID list']
}

/** 0 healthy, 1 questionable, 2 doubtful, 3 not playing. */
export function injuryLevel(status) {
  if (!status) return 0
  if (status === 'QUESTIONABLE') return 1
  if (status === 'DOUBTFUL') return 2
  if (OUT_STATUSES.has(status)) return 3
  return 1
}

export function injuryShort(status) {
  return INJURY_LABELS[status]?.[0] || String(status).slice(0, 3)
}

export function injuryLabel(status) {
  const known = INJURY_LABELS[status]?.[1]
  if (known) return known
  const text = String(status).replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The lineup slot a player occupies. Data from before slots were recorded only
 * says starter or not, so a starter falls back to their own position.
 */
export function slotOf(player) {
  return player.slot || (player.starter ? player.position : 'BE')
}

/** Starters show the slot they fill, everyone else shows their position. */
export function slotLabel(player) {
  return player.starter ? slotOf(player) : player.position || slotOf(player)
}

export function isReserve(player) {
  return RESERVE_SLOTS.has(player.slot)
}

export function canFill(slot, candidate) {
  const allowed = FLEX_SLOTS[slot]
  return allowed ? allowed.includes(candidate.position) : candidate.position === slot
}

export function sortBySlot(players) {
  const order = (player) => {
    const index = SLOT_ORDER.indexOf(slotLabel(player))
    return index === -1 ? 99 : index
  }
  return [...players].sort(
    (a, b) => order(a) - order(b) || (b.projected ?? -1) - (a.projected ?? -1)
  )
}

/** upcoming, live, played, or bye. */
export function gameState(player, now = Date.now()) {
  if (!player.game) return 'bye'
  const start = Date.parse(player.game.kickoffISO)
  if (!Number.isFinite(start) || now < start) return 'upcoming'
  return now < start + GAME_WINDOW_MS ? 'live' : 'played'
}

// Game day mode in the workflow refreshes about every ten minutes from three hours
// before a kickoff until the game is over.
const PREGAME_MS = 3 * 60 * 60 * 1000

/** True while any of your players' games is close enough that refreshes should be frequent. */
export function onGameClock(leagues, now = Date.now()) {
  return leagues.some((league) =>
    league.roster.some((player) => {
      const start = Date.parse(player.game?.kickoffISO)
      return Number.isFinite(start) && now >= start - PREGAME_MS && now < start + GAME_WINDOW_MS
    })
  )
}

export function isLocked(player, now = Date.now()) {
  const state = gameState(player, now)
  return state === 'live' || state === 'played'
}

/**
 * A whole roster with no games attached means the schedule failed to load, not
 * that the entire team is on bye. Treating it as a bye would bench everyone.
 */
export function scheduleKnown(roster) {
  return roster.some((player) => player.game)
}

// Covering a starter who will not play always outranks any upgrade elsewhere.
const URGENT_WEIGHT = 1e6

/**
 * Everything the lineup views need to know, worked out once.
 *
 * Swaps are chosen for the lineup as a whole rather than slot by slot, so one bench
 * player is never offered as the answer to two slots, and the single biggest gain
 * never blocks a better combination (a bench RB into the RB slot and a bench WR
 * into flex can beat the RB into flex alone). Starters whose games have kicked off
 * are locked on both platforms and left alone.
 */
export function lineupReport(roster, now = Date.now()) {
  const known = scheduleKnown(roster)
  const starters = roster.filter((player) => player.starter)
  const bench = roster.filter((player) => !player.starter && !isReserve(player))

  const reasonFor = (player) => {
    if (known && !player.game) return 'bye'
    const level = injuryLevel(player.injuryStatus)
    if (level >= 3) return 'out'
    if (level === 2) return 'doubtful'
    return null
  }

  const open = starters.filter((player) => !isLocked(player, now))
  const available = bench.filter((player) => !isLocked(player, now) && !reasonFor(player))

  /** What moving this bench player into this starter's slot is worth, or null. */
  const value = (starter, candidate) => {
    if (!canFill(slotOf(starter), candidate)) return null
    if (reasonFor(starter)) return URGENT_WEIGHT + (candidate.projected ?? 0)
    if (starter.projected == null || candidate.projected == null) return null
    const gain = candidate.projected - starter.projected
    return gain >= MIN_GAIN ? gain : null
  }

  const taken = new Set()
  const swaps = bestAssignment(open, available, value).map(([starter, replacement]) => {
    taken.add(starter.playerId)
    taken.add(replacement.playerId)
    const reason = reasonFor(starter)
    return {
      starter,
      replacement,
      gain: (replacement.projected ?? 0) - (starter.projected ?? 0),
      urgent: Boolean(reason),
      reason: reason || 'upgrade'
    }
  })
  swaps.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.gain - a.gain)

  // Starters who will not play and have nobody on the bench to cover them.
  const stranded = starters
    .filter((player) => !isLocked(player, now) && reasonFor(player) && !taken.has(player.playerId))
    .map((player) => ({ starter: player, reason: reasonFor(player) }))

  // Questionable starters are worth a look before kickoff, not an automatic swap.
  const watch = starters
    .filter(
      (player) =>
        !taken.has(player.playerId) &&
        !isLocked(player, now) &&
        injuryLevel(player.injuryStatus) === 1
    )
    .map((player) => ({
      starter: player,
      backup:
        bench
          .filter((candidate) => !taken.has(candidate.playerId) && !reasonFor(candidate))
          .filter((candidate) => !isLocked(candidate, now) && canFill(slotOf(player), candidate))
          .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1))[0] || null
    }))

  const progress = { upcoming: 0, live: 0, played: 0, bye: 0 }
  for (const player of starters) progress[gameState(player, now)]++

  const upcomingKickoffs = starters
    .filter((player) => gameState(player, now) === 'upcoming' && player.game?.kickoffISO)
    .map((player) => Date.parse(player.game.kickoffISO))

  return {
    starters,
    bench,
    reserve: roster.filter(isReserve),
    swaps,
    stranded,
    watch,
    urgentCount: swaps.filter((swap) => swap.urgent).length + stranded.length,
    projectedTotal: starters.reduce((sum, player) => sum + (player.projected ?? 0), 0),
    pointsAdded: swaps.reduce((sum, swap) => sum + Math.max(0, swap.gain), 0),
    lockedCount: starters.filter((player) => isLocked(player, now)).length,
    hasProjections: roster.some((player) => player.projected != null),
    scheduleKnown: known,
    progress,
    nextKickoff: upcomingKickoffs.length ? new Date(Math.min(...upcomingKickoffs)).toISOString() : null
  }
}

/**
 * The set of starter and bench pairs with the highest total value, where each
 * player appears at most once. Benches are small, so an exact search over which
 * bench players are used is instant. A very deep bench falls back to taking the
 * best remaining pair each time, which is close and still never double books.
 */
function bestAssignment(starters, candidates, value) {
  const pool = candidates.filter((candidate) =>
    starters.some((starter) => value(starter, candidate) != null)
  )

  if (pool.length > 16) {
    const pairs = []
    for (const starter of starters) {
      for (const candidate of pool) {
        const worth = value(starter, candidate)
        if (worth != null) pairs.push([starter, candidate, worth])
      }
    }
    pairs.sort((a, b) => b[2] - a[2])
    const used = new Set()
    const picks = []
    for (const [starter, candidate] of pairs) {
      if (used.has(starter) || used.has(candidate)) continue
      used.add(starter)
      used.add(candidate)
      picks.push([starter, candidate])
    }
    return picks
  }

  const memo = new Map()
  const solve = (index, mask) => {
    if (index === starters.length) return { total: 0, picks: [] }
    const key = index * 65536 + mask
    if (memo.has(key)) return memo.get(key)

    let best = solve(index + 1, mask)
    pool.forEach((candidate, slot) => {
      if (mask & (1 << slot)) return
      const worth = value(starters[index], candidate)
      if (worth == null) return
      const rest = solve(index + 1, mask | (1 << slot))
      if (rest.total + worth > best.total) {
        best = { total: rest.total + worth, picks: [[starters[index], candidate], ...rest.picks] }
      }
    })

    memo.set(key, best)
    return best
  }

  return solve(0, 0).picks
}

/**
 * True when a free agent's opening comes from an injury to one of your own
 * players, which makes them your handcuff rather than just a good pickup.
 */
export function coversRoster(player, rosterIds) {
  return Boolean(
    player.opportunity?.injured?.some(
      (injured) => rosterIds.has(injured.sleeperId) || rosterIds.has(injured.espnId)
    )
  )
}

/**
 * Finds the fullest record of a player anywhere in a league. Change entries and
 * news chips only carry a name and an image, while the roster and waiver records
 * carry projections, usage, and news, which is what the player sheet shows.
 */
export function resolvePlayer(league, player) {
  if (!league || !player) return player
  const id = player.playerId
  const sources = [
    ['roster', league.roster],
    ['waiver', league.waivers],
    ['consensus', league.consensus]
  ]
  for (const [kind, list] of sources) {
    const match = (list || []).find((entry) => entry.playerId === id)
    if (match) return { ...player, ...match, context: player.context || kind }
  }
  for (const team of league.teams || []) {
    const match = team.roster.find((entry) => entry.playerId === id)
    if (match) return { ...player, ...match, ownerName: team.isMine ? null : team.name }
  }
  return player
}

/** Every story in the feed that names this player, newest first, without repeats. */
export function storiesFor(player, news = []) {
  const seen = new Set()
  const stories = []
  const tagged = (news || []).filter((item) =>
    item.players?.some((entry) => entry.playerId === player.playerId)
  )
  for (const item of [...(player.news || []), ...tagged]) {
    const key = (item.headline || '').toLowerCase().slice(0, 90)
    if (!key || seen.has(key)) continue
    seen.add(key)
    stories.push(item)
  }
  return stories.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0))
}
