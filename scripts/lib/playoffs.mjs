// The lineup rules live with the app, in plain modules with no browser code, so
// the refresh reads a roster's outlook from the same place the app does.
import { outlook } from '../../web/src/lib/prep.js'

/**
 * The playoff picture: each team's chance of making the playoffs, by playing out
 * the rest of the regular season many times over.
 *
 * This week's games use what the app already knows about them: every starter's
 * projection, the points already scored, and how much each player's score tends
 * to swing. Later weeks have no lineups yet, so a team scores around its season
 * average, pulled a little toward the league's, with the spread teams in this
 * league have actually shown from week to week.
 *
 * Seeding follows record first and points scored second, with division winners
 * ahead of everyone else where a league has divisions. A league that breaks ties
 * another way is still seeded on points here, and says so.
 *
 * The random numbers come from a seed made of the league and the week, so the
 * odds only move when the standings or this week's games do, not from one
 * refresh to the next.
 */

const SIMULATIONS = 20000
// How far a typical team's weekly score lands from its average, when the league
// has not played enough to show its own.
const DEFAULT_SPREAD = 22
const MIN_SPREAD = 12
// A team's own average counts fully after about this many games.
const REGRESSION_GAMES = 3

/**
 * league needs season (from the adapter), results, teams, and for this week's
 * games each team's roster. Returns null without playoff settings.
 */
export function playoffPicture(league, { week, asOf = Date.now(), simulations = SIMULATIONS } = {}) {
  const season = league.season
  if (!season?.playoffTeams || !season.lastWeek || !season.records?.length) return null

  const names = new Map((league.teams || []).map((team) => [String(team.teamId), team]))
  const results = (league.results || []).filter((game) => game.week <= season.lastWeek)
  const standing = reconcile(season, results)
  const remaining = (season.pairings || []).filter(
    (game) => game.week >= week && game.week <= season.lastWeek && standing.has(String(game.a)) && standing.has(String(game.b))
  )
  const model = scoringModel(standing, results)
  const ids = [...standing.keys()]
  const index = new Map(ids.map((id, position) => [id, position]))
  const mine = ids.find((id) => names.get(id)?.isMine) || null
  const byes = byeCount(season.playoffTeams)

  // This week's games play out from each team's lineup. A team with no lineup to
  // read, or nothing projected, falls back to its season scoring like later weeks.
  const thisWeek = new Map()
  for (const game of remaining) {
    if (game.week !== week) continue
    for (const id of [String(game.a), String(game.b)]) {
      const roster = names.get(id)?.roster
      const view = roster?.length ? outlook(roster, asOf) : null
      if (view && view.mean > 0) thisWeek.set(id, { mean: view.mean, spread: Math.sqrt(view.variance) })
    }
  }

  const games = remaining.map((game) => {
    const a = String(game.a)
    const b = String(game.b)
    const side = (id) => (game.week === week && thisWeek.has(id) ? thisWeek.get(id) : { mean: model.mean.get(id), spread: model.spread })
    return { week: game.week, a: index.get(a), b: index.get(b), sideA: side(a), sideB: side(b), mine: a === mine || b === mine }
  })
  const weeks = [...new Set(games.map((game) => game.week))].sort((x, y) => x - y)
  const myGame = games.find((game) => game.week === week && game.mine) || null

  const base = ids.map((id) => standing.get(id))
  const made = new Array(ids.length).fill(0)
  const bye = new Array(ids.length).fill(0)
  const winsTotal = new Array(ids.length).fill(0)
  const split = { win: { runs: 0, made: 0 }, lose: { runs: 0, made: 0 } }
  const random = seeded(`${league.id}:${week}:${season.lastWeek}`)
  const runs = games.length === 0 ? 1 : simulations

  const wins = new Float64Array(ids.length)
  const points = new Float64Array(ids.length)
  const scored = new Float64Array(ids.length)
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < ids.length; i++) {
      wins[i] = base[i].wins + base[i].ties / 2
      points[i] = base[i].pointsFor
    }
    let myResult = null
    for (const current of weeks) {
      scored.fill(NaN)
      for (const game of games) {
        if (game.week !== current) continue
        const a = game.sideA.mean + game.sideA.spread * normal(random)
        const b = game.sideB.mean + game.sideB.spread * normal(random)
        scored[game.a] = a
        scored[game.b] = b
        points[game.a] += a
        points[game.b] += b
        if (a > b) wins[game.a] += 1
        else wins[game.b] += 1
        if (game === myGame) myResult = (ids[game.a] === mine ? a > b : b > a) ? 'win' : 'lose'
      }
      // The extra game against the league's median score, where a league plays one.
      if (season.median) {
        const line = median([...scored].filter((value) => !Number.isNaN(value)))
        for (let i = 0; i < ids.length; i++) {
          if (!Number.isNaN(scored[i]) && scored[i] > line) wins[i] += 1
        }
      }
    }

    const order = seedOrder(ids.length, wins, points, base)
    for (let seed = 0; seed < order.length; seed++) {
      const team = order[seed]
      winsTotal[team] += wins[team]
      if (seed < season.playoffTeams) made[team]++
      if (seed < byes) bye[team]++
    }
    if (myResult) {
      split[myResult].runs++
      if (order.indexOf(index.get(mine)) < season.playoffTeams) split[myResult].made++
    }
  }

  const now = seedOrder(
    ids.length,
    base.map((team) => team.wins + team.ties / 2),
    base.map((team) => team.pointsFor),
    base
  )
  const round = (value) => Number(value.toFixed(3))
  const rows = now.map((team, seed) => ({
    teamId: names.get(ids[team])?.teamId ?? base[team].teamId,
    name: names.get(ids[team])?.name || `Team ${ids[team]}`,
    isMine: ids[team] === mine,
    seed: seed + 1,
    wins: base[team].wins,
    losses: base[team].losses,
    ties: base[team].ties,
    pointsFor: Number(base[team].pointsFor.toFixed(2)),
    odds: round(made[team] / runs),
    byeOdds: byes ? round(bye[team] / runs) : null,
    projectedWins: Number((winsTotal[team] / runs).toFixed(1))
  }))
  const me = rows.find((row) => row.isMine) || null

  return {
    playoffTeams: season.playoffTeams,
    byes,
    lastWeek: season.lastWeek,
    // Regular season weeks still to finish, this one included.
    weeksLeft: weeks.length,
    decided: games.length === 0,
    tiebreak: season.tiebreak || 'points',
    median: Boolean(season.median),
    rows,
    mine: me && {
      seed: me.seed,
      odds: me.odds,
      byeOdds: me.byeOdds,
      // What this week's game is worth: your odds after a win and after a loss.
      ifWin: split.win.runs >= 50 ? round(split.win.made / split.win.runs) : null,
      ifLose: split.lose.runs >= 50 ? round(split.lose.made / split.lose.runs) : null,
      winChance: myGame ? round(split.win.runs / runs) : null
    }
  }
}

/**
 * Each team's record through the last finished week. The platform's own record
 * is used unless the results on file cover more games, which happens on a Tuesday
 * before the platform has closed out the week.
 */
function reconcile(season, results) {
  const derived = new Map(
    season.records.map((record) => [String(record.teamId), { ...record, wins: 0, losses: 0, ties: 0, pointsFor: 0 }])
  )
  const byWeek = new Map()
  for (const game of results) {
    const a = derived.get(String(game.a))
    const b = derived.get(String(game.b))
    if (!a || !b) continue
    a.pointsFor += game.aPoints
    b.pointsFor += game.bPoints
    if (Math.abs(game.aPoints - game.bPoints) < 0.005) {
      a.ties++
      b.ties++
    } else {
      const [winner, loser] = game.aPoints > game.bPoints ? [a, b] : [b, a]
      winner.wins++
      loser.losses++
    }
    if (!byWeek.has(game.week)) byWeek.set(game.week, [])
    byWeek.get(game.week).push([a, game.aPoints], [b, game.bPoints])
  }
  if (season.median) {
    for (const scores of byWeek.values()) {
      const line = median(scores.map(([, value]) => value))
      for (const [team, value] of scores) {
        if (value > line) team.wins++
        else if (value < line) team.losses++
        else team.ties++
      }
    }
  }

  const played = (records) => records.reduce((sum, record) => sum + record.wins + record.losses + record.ties, 0)
  const source = played([...derived.values()]) > played(season.records) ? [...derived.values()] : season.records
  return new Map(source.map((record) => [String(record.teamId), { ...record }]))
}

/**
 * How each team scores in a week with no lineup to go on: its average, pulled
 * toward the league's while it has few games, and one spread for the league,
 * measured from how far teams have landed from their own averages.
 */
function scoringModel(standing, results) {
  const scores = new Map([...standing.keys()].map((id) => [id, []]))
  for (const game of results) {
    scores.get(String(game.a))?.push(game.aPoints)
    scores.get(String(game.b))?.push(game.bPoints)
  }
  const all = [...scores.values()].flat()
  const league = all.length ? all.reduce((sum, value) => sum + value, 0) / all.length : 100

  const mean = new Map()
  let squares = 0
  let freedom = 0
  for (const [id, list] of scores) {
    const own = list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : league
    const weight = list.length / (list.length + REGRESSION_GAMES)
    mean.set(id, league + weight * (own - league))
    if (list.length >= 2) {
      squares += list.reduce((sum, value) => sum + (value - own) ** 2, 0)
      freedom += list.length - 1
    }
  }
  const spread = freedom >= 8 ? Math.max(MIN_SPREAD, Math.sqrt(squares / freedom)) : DEFAULT_SPREAD
  return { mean, spread }
}

/**
 * Team positions in seed order: record, then points. With divisions, each
 * division's best team is seeded ahead of the rest.
 */
function seedOrder(count, wins, points, base) {
  const order = Array.from({ length: count }, (_, i) => i)
  const better = (a, b) => wins[b] - wins[a] || points[b] - points[a]
  order.sort(better)
  if (!base.some((team) => team.division != null)) return order
  const winners = []
  const seen = new Set()
  for (const team of order) {
    const division = base[team].division
    if (division == null || seen.has(division)) continue
    seen.add(division)
    winners.push(team)
  }
  return [...winners, ...order.filter((team) => !winners.includes(team))]
}

/** How many top seeds sit out the first round: 2 of 6, none of 4 or 8. */
export function byeCount(playoffTeams) {
  if (playoffTeams < 2) return 0
  return 2 ** Math.ceil(Math.log2(playoffTeams)) - playoffTeams
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** A small repeatable random number generator, mulberry32, seeded from a string. */
function seeded(text) {
  let state = 2166136261
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw, by Box and Muller. */
function normal(random) {
  let u = 0
  while (u === 0) u = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}
