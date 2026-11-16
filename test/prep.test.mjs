import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './helpers/pipeline.mjs'
import { lineupReport } from '../web/src/lib/lineup.js'
import { matchupReport } from '../web/src/lib/matchup.js'
import { byeReport, coverFor } from '../web/src/lib/byes.js'
import {
  chanceAbove, chanceLabel, gainLabel, itemLine, itemNote, likelyLineup, prepReport, spreadOf, swapLine, winChance
} from '../web/src/lib/prep.js'

// The Sleeper league from the mocked refresh, on the Tuesday of week 9.
const fresh = fixture
const NOW = Date.parse('2026-11-03T16:00:00Z')

function run(data, now = NOW) {
  const league = data.leagues[0]
  const report = lineupReport(league.roster, now)
  const matchup = matchupReport(league, data.generatedAt, now)
  const byes = byeReport(league, report, data.byeWeeks, data.week, now)
  return { league, report, matchup, byes, prep: prepReport(league, matchup, report, byes, now) }
}


test('a spread follows the player, within limits', () => {
  // Spreads: a player's own games pull away from the position's typical spread.
  const steady = { position: 'WR', projected: 12, swing: { games: 8, mean: 12, sd: 1.2 } }
  const wild = { position: 'WR', projected: 12, swing: { games: 8, mean: 12.5, sd: 10.4 } }
  const unknown = { position: 'WR', projected: 12 }
  assert.ok(spreadOf(steady) < spreadOf(unknown) && spreadOf(unknown) < spreadOf(wild), 'steady < typical < wild')
  assert.equal(spreadOf(steady), 0.3 * 12, 'clamped at the floor')
  assert.equal(spreadOf({ position: 'TE', projected: 0 }), 1, 'a player projecting nothing still has a minimum')
  assert.equal(chanceAbove(5, 0), 1)
  assert.equal(chanceAbove(0, 0), 0.5)
  assert.ok(Math.abs(chanceAbove(0, 100) - 0.5) < 1e-9)
  assert.ok(Math.abs(chanceAbove(1.96, 1) - 0.975) < 1e-4, 'normal cdf')
})

test('win chance is calibrated and narrows as games are played', () => {
  // Calibration: two typical lineups ten points apart is about a 60-65% favorite.
  const lineup = (bump) =>
    [['QB', 21], ['RB', 15], ['RB', 13], ['WR', 15], ['WR', 13], ['TE', 9], ['WR', 11], ['K', 8], ['DEF', 7]].map(
      ([position, projected], i) => ({ player: { playerId: `${bump}${i}`, position, projected: projected + (i === 0 ? bump : 0) }, expected: projected + (i === 0 ? bump : 0), remaining: 1 })
    )
  assert.ok(Math.abs(winChance(lineup(0), lineup(0)) - 0.5) < 1e-9, 'equal lineups are a coin flip')
  const tenUp = winChance(lineup(10), lineup(0))
  assert.ok(tenUp > 0.6 && tenUp < 0.67, `ten points up: ${tenUp}`)
  // Once games are played the spread shrinks, so the same lead is safer.
  const played = lineup(10).map((row) => ({ ...row, remaining: 0.2 }))
  const late = winChance(played, lineup(0).map((row) => ({ ...row, remaining: 0.2 })))
  assert.ok(late > tenUp + 0.1 && late < 0.85, `a late lead is safer: ${late}`)
})

test('the to-do list for a week with injuries, a bye and a weak defense', () => {
  // The week 9 mock: two of yours need cover, a free agent defense beats yours, and
  // Team Taco has two starters on bye and one out, all covered from their bench.
  {
    const { prep, byes, matchup } = run(fresh())
    assert.equal(prep.week, 9)
    assert.equal(prep.opponent, 'Team Taco')
    assert.deepEqual(
      prep.theirSwaps.map((swap) => [swap.starter.name, swap.reason, swap.replacement?.name]),
      [['Tony Pollard', 'bye', 'Rachaad White'], ['Calvin Ridley', 'bye', 'Jauan Jennings'], ['Sam LaPorta', 'out', 'Tucker Kraft']]
    )
    assert.ok(Math.abs(prep.theirProjection - 133.5) < 0.01, `their likely total ${prep.theirProjection}`)
    assert.ok(Math.abs(matchup.them.projection - 101) < 0.01, 'the matchup itself still shows the lineup as set')
    assert.deepEqual(prep.items.map((item) => item.kind), ['start', 'pickup', 'upgrade', 'swing'])
    const [start, pickup, upgrade, swing] = prep.items
    assert.equal(itemLine(start), 'Start Chuba Hubbard over James Cook')
    assert.equal(itemNote(start), 'J. Cook is out.')
    assert.equal(itemLine(pickup), 'Pick up Jake Ferguson for Pat Freiermuth')
    assert.ok(pickup.openSpot, 'the one open roster spot goes to the first pickup')
    // The bye pickup and its roster spot are the bye planner's, so the views agree.
    const planned = coverFor(byes, pickup.over.playerId, 0)
    assert.equal(planned.pickup.player.playerId, pickup.player.playerId)
    assert.equal(Boolean(planned.openSpot), true)
    assert.equal(itemLine(upgrade), 'Pick up LAC\u00a0D/ST to start over NYG\u00a0D/ST')
    assert.equal(upgrade.drop.name, 'Rashid Shaheed', 'the lowest season projection on the bench, not part of the plan')
    assert.equal(itemNote(upgrade), 'Projects 4.5 more than NYG\u00a0D/ST. Drop Rashid Shaheed to make room.')
    for (const item of [start, pickup, upgrade]) assert.ok(item.gain > 0.02, `${item.kind} raises the chance`)
    assert.ok(prep.chance < 0.15 && prep.planned > 0.3 && prep.planned < 0.45, `${prep.chance} -> ${prep.planned}`)
    assert.equal(prep.status, 'underdog')
    assert.equal(itemLine(swing), 'Take the swing: start Romeo Doubs over Jaylen Waddle')
    assert.equal(swing.gain, null, 'the tip claims no win chance')
    assert.match(itemNote(swing), /underdog, so a higher ceiling.*R\. Doubs usually scores 2\.0 to 23\.9, J\. Waddle 11\.0 to 13\.0\./)
    assert.equal(prep.todo, 4)
    assert.equal(swapLine(prep.theirSwaps[2]), 'S. LaPorta is out, so they\'ll likely start T. Kraft')
    assert.ok(Math.abs(prep.myProjection - 126.7) < 0.01, 'yours after the list')
    assert.deepEqual(prep.edges.mine.map((edge) => edge.slot), ['WR', 'TE'])
    assert.deepEqual(prep.edges.theirs.map((edge) => edge.slot), ['FLEX', 'QB'])
    assert.deepEqual(prep.recent.them.games.map((game) => game.points), [120.6, 98.1, 132.4])
    assert.ok(Math.abs(prep.recent.them.average - 117.03) < 0.01)
    assert.deepEqual(prep.series.map((game) => [game.week, game.outcome, game.points, game.against]), [[3, 'won', 121.4, 99.2]])
  }
})

test('the favorite gets the safe tip', () => {
  // Favored: a volatile starter and a steady bench player close behind get the
  // safe tip instead. The opponent's bench is emptied to make you the favorite.
  {
    const data = fresh()
    const league = data.leagues[0]
    const opponent = league.teams.find((team) => team.teamId === league.matchup.opponentTeamId)
    opponent.roster = opponent.roster.filter((player) => player.starter)
    const waddle = league.roster.find((player) => player.name === 'Jaylen Waddle')
    const doubs = league.roster.find((player) => player.name === 'Romeo Doubs')
    Object.assign(doubs, { slot: 'FLEX', starter: true, projected: 12 })
    Object.assign(waddle, { slot: 'BE', starter: false, projected: 11.2 })
    const { prep } = run(data)
    assert.equal(prep.status, 'favorite')
    const tip = prep.items.find((item) => item.kind === 'swing')
    assert.equal(itemLine(tip), 'Play it safe: start Jaylen Waddle over Romeo Doubs')
    assert.match(itemNote(tip), /^You're favored, so a safer floor/)
    assert.ok(prep.theirSwaps.every((swap) => swap.replacement === null), 'nobody left on their bench')
    assert.equal(swapLine(prep.theirSwaps[0]), 'T. Pollard is on bye, and nobody on their bench can play RB')
  }
})

test('a projection gap over two points gets no tip', () => {
  // A projection gap over two points gets no tip either way.
  {
    const data = fresh()
    data.leagues[0].roster.find((player) => player.name === 'Romeo Doubs').projected = 9.5
    const { prep } = run(data)
    assert.ok(!prep.items.some((item) => item.kind === 'swing'))
  }
})

test('a slot nobody can fill says so, with no chance attached', () => {
  // No free agent can play the slot: the item says to look, with no chance attached.
  {
    const data = fresh()
    data.leagues[0].waivers = data.leagues[0].waivers.filter((player) => player.position !== 'TE')
    data.leagues[0].byeOptions = {}
    const { prep } = run(data)
    const hole = prep.items.find((item) => item.kind === 'hole')
    assert.equal(itemLine(hole), 'Find a TE for Pat Freiermuth')
    assert.equal(hole.gain, null)
    assert.match(itemNote(hole), /on bye, nobody on your bench can play TE, and no free agent/)
  }
})

test('a player whose game has started is left alone', () => {
  // Thursday night: Waddle's game has started, so he is neither moved nor tipped,
  // and a played opponent starter is not swapped.
  {
    const data = fresh()
    const league = data.leagues[0]
    const waddle = league.roster.find((player) => player.name === 'Jaylen Waddle')
    const kickoff = '2026-11-05T20:15:00-05:00'
    waddle.game = { ...waddle.game, kickoffISO: kickoff }
    const thursday = Date.parse('2026-11-06T02:30:00Z')
    const { prep } = run(data, thursday)
    assert.ok(!prep.items.some((item) => item.over?.playerId === waddle.playerId || item.player?.playerId === waddle.playerId))
  }
})

test('no matchup, a final one, or a missing opponent means no prep', () => {
  // Final, missing opponent, or no matchup: nothing to prep.
  {
    const data = fresh()
    const league = data.leagues[0]
    assert.equal(prepReport(league, null, lineupReport(league.roster, NOW), null, NOW), null)
    const { report, matchup, byes } = run(data)
    assert.equal(prepReport(league, { ...matchup, final: true }, report, byes, NOW), null)
    assert.equal(prepReport({ ...league, teams: [] }, matchup, report, byes, NOW), null)
  }

  // likelyLineup on its own: a doubtful starter counts as sitting too.
  {
    const roster = [
      { playerId: 'a', position: 'RB', slot: 'RB', starter: true, projected: 8, injuryStatus: 'DOUBTFUL', game: { kickoffISO: '2026-11-08T18:00:00Z' } },
      { playerId: 'b', position: 'RB', slot: 'BE', starter: false, projected: 9, game: { kickoffISO: '2026-11-08T18:00:00Z' } }
    ]
    const likely = likelyLineup([{ player: roster[0], expected: 8, remaining: 1 }], roster, NOW)
    assert.equal(likely.swaps[0].reason, 'doubtful')
    assert.equal(likely.rows[0].player.playerId, 'b')
    assert.equal(likely.rows[0].slot, 'RB', 'the bench player takes over the slot')
  }
})

test('an uncovered starter is only listed when they never had cover', () => {
  // Sunday night: their starter on bye had a bench back who could have filled in but
  // has already played, so there is nothing left to scout about that slot.
  {
    const played = { kickoffISO: '2026-11-08T18:00:00Z' }
    const roster = [
      { playerId: 'a', position: 'RB', slot: 'RB', starter: true, projected: 0, team: 'SF', game: null },
      { playerId: 'b', position: 'RB', slot: 'BE', starter: false, projected: 9, game: played },
      { playerId: 'c', position: 'TE', slot: 'TE', starter: true, projected: 0, team: 'SF', game: null }
    ]
    const rows = [roster[0], roster[2]].map((player) => ({ player, expected: 0, remaining: 0 }))
    const sunday = Date.parse('2026-11-09T04:00:00Z')
    const likely = likelyLineup(rows, roster, sunday)
    assert.deepEqual(likely.swaps.map((swap) => [swap.starter.playerId, swap.replacement]), [['c', null]], 'only the slot they never had cover for')
  }
})

test('labels', () => {
  assert.equal(chanceLabel(0.004), '1%')
  assert.equal(chanceLabel(0.999), '99%')
  assert.equal(chanceLabel(0.615), '62%')
  assert.equal(gainLabel(0.112), '+11%')
  assert.equal(gainLabel(0.003), '<1%')
  assert.equal(gainLabel(-0.02), '-2%')
  assert.equal(gainLabel(null), null)
})
