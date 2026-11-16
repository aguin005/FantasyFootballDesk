import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './helpers/pipeline.mjs'

const { applyLive, gamesOn, liveInterval, sleeperId, withLive } = await import('../web/src/lib/live.js')

const data = fixture()
const league = data.leagues.find((entry) => entry.platform === 'sleeper')
const espn = data.leagues.find((entry) => entry.platform === 'espn')
const AT = Date.parse('2026-11-08T19:30:00Z')
const byName = (roster, name) => roster.find((player) => player.name === name)
const id = (name) => byName(league.roster, name).playerId

/** Sleeper's matchups answer for the fixture league, with changes laid over it. */
function entries(change = {}) {
  return league.teams.map((team, index) => {
    const mine = team.isMine
    const starters = team.roster.filter((player) => player.starter).map((player) => player.playerId)
    return {
      roster_id: team.teamId,
      matchup_id: index < 2 ? 1 : 2,
      points: mine ? 61.5 : 40.25 + index,
      custom_points: null,
      players: team.roster.map((player) => player.playerId),
      starters,
      players_points: mine ? { [id('Josh Allen')]: 24.36, [id('Bijan Robinson')]: 0, [id('Chuba Hubbard')]: 11.2 } : {},
      ...(mine ? change : {})
    }
  })
}

test('only Sleeper leagues are synced', () => {
  assert.equal(sleeperId(league), 'L1')
  assert.equal(sleeperId(espn), null)
  assert.equal(sleeperId(null), null)
})

test('points and totals come from the live answer', () => {
  const live = applyLive(league, entries(), AT, 9)
  assert.equal(live.liveAt, AT)
  assert.equal(byName(live.roster, 'Josh Allen').points, 24.36)
  assert.equal(byName(live.roster, 'Bijan Robinson').points, 0, 'a zero is a score, not a blank')
  assert.equal(byName(live.roster, 'Garrett Wilson').points, null, 'nothing yet for a player who has not played')
  assert.equal(byName(live.roster, 'Chuba Hubbard').points, 11.2, 'bench players are scored too')
  assert.deepEqual(live.matchup, { week: 9, opponentTeamId: 2, score: 61.5, opponentScore: 41.25 })
  // The same players in the league's list of teams, which the head to head reads.
  const mine = live.teams.find((team) => team.isMine)
  assert.equal(byName(mine.roster, 'Josh Allen').points, 24.36)
  // Nothing else about a player is touched, and the original is left as it was.
  assert.equal(byName(live.roster, 'Josh Allen').projected, 22.5)
  assert.equal(byName(league.roster, 'Josh Allen').points, null)
  assert.equal(league.liveAt, undefined)
})

test('a lineup change made in Sleeper shows at once', () => {
  // Hubbard in for the injured Cook, and Doubs into the flex for Waddle.
  const starters = league.roster.filter((player) => player.starter).map((player) => player.playerId)
  starters[starters.indexOf(id('James Cook'))] = id('Chuba Hubbard')
  starters[starters.indexOf(id('Jaylen Waddle'))] = id('Romeo Doubs')
  const live = applyLive(league, entries({ starters }), AT, 9)
  assert.deepEqual([byName(live.roster, 'Chuba Hubbard').slot, byName(live.roster, 'Chuba Hubbard').starter], ['RB', true])
  assert.deepEqual([byName(live.roster, 'Romeo Doubs').slot, byName(live.roster, 'Romeo Doubs').starter], ['FLEX', true])
  assert.deepEqual([byName(live.roster, 'James Cook').slot, byName(live.roster, 'James Cook').starter], ['BE', false])
  assert.deepEqual([byName(live.roster, 'Jaylen Waddle').slot, byName(live.roster, 'Jaylen Waddle').starter], ['BE', false])
  assert.equal(live.roster.filter((player) => player.starter).length, 9)
})

test('an empty lineup spot, a dropped player and an added one', () => {
  const starters = league.roster.filter((player) => player.starter).map((player) => player.playerId)
  starters[starters.indexOf(id('Pat Freiermuth'))] = '0'
  const players = league.roster.map((player) => player.playerId).filter((playerId) => playerId !== id('Rashid Shaheed'))
  players.push('9999')
  const live = applyLive(league, entries({ starters, players }), AT, 9)
  assert.equal(byName(live.roster, 'Pat Freiermuth').starter, false, 'taken out with nobody put in')
  assert.equal(byName(live.roster, 'Rashid Shaheed'), undefined, 'dropped since the refresh')
  assert.equal(live.roster.length, league.roster.length - 1, 'the added player waits for the next refresh')
})

test('a league without a lineup order keeps its slots and still gets points', () => {
  const old = { ...league, lineupSlots: undefined }
  const starters = league.roster.filter((player) => player.starter).map((player) => player.playerId).reverse()
  const live = applyLive(old, entries({ starters }), AT, 9)
  assert.deepEqual(live.roster.map((player) => player.slot), league.roster.map((player) => player.slot))
  assert.equal(byName(live.roster, 'Josh Allen').points, 24.36)
})

test('a bye week, a missing opponent and an unusable answer', () => {
  assert.equal(applyLive(league, entries({ matchup_id: null }), AT, 9).matchup, null)
  const alone = entries().filter((entry) => entry.roster_id !== 2)
  assert.deepEqual(applyLive(league, alone, AT, 9).matchup, league.matchup, 'nobody on the other side: the refresh stands')
  assert.equal(applyLive(league, [], AT, 9), league)
  assert.equal(applyLive(league, null, AT, 9), league)
  assert.equal(applyLive(league, entries().filter((entry) => entry.roster_id !== 1), AT, 9), league, 'your roster is not in the answer')
  const adjusted = applyLive(league, entries({ custom_points: 70 }), AT, 9)
  assert.equal(adjusted.matchup.score, 70, "a commissioner's adjustment replaces the computed total")
})

test('the newest answer is applied per league, and only for this week', () => {
  const published = Date.parse(data.generatedAt)
  const snapshot = (at, week = 9) => ({ 'sleeper:L1': { entries: entries(), at, week } })
  const [first, second] = withLive(data, snapshot(published + 60e3))
  assert.equal(first.liveAt, published + 60e3)
  assert.equal(second, espn, 'the ESPN league is passed through untouched')
  assert.equal(withLive(data, snapshot(published - 1))[0], league, 'older than the published data')
  assert.equal(withLive(data, snapshot(published + 60e3, 8))[0], league, 'an answer for another week')
  assert.deepEqual(withLive(data, {}), data.leagues)
  assert.deepEqual(withLive(null, {}), [])
})

test('Sleeper is asked every minute during games and every five otherwise', () => {
  const kickoff = Date.parse(data.schedule.games[0].kickoffISO)
  assert.equal(gamesOn(data.schedule, kickoff - 16 * 60e3), false)
  assert.equal(gamesOn(data.schedule, kickoff - 15 * 60e3), true)
  assert.equal(gamesOn(data.schedule, kickoff + 4 * 3600e3), true)
  assert.equal(liveInterval(data.schedule, kickoff + 3600e3), 60e3)
  assert.equal(liveInterval(data.schedule, Date.parse('2026-11-03T16:00:00Z')), 5 * 60e3)
  assert.equal(liveInterval(undefined), 5 * 60e3)
})
