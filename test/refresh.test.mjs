import test from 'node:test'
import assert from 'node:assert/strict'
import { runRefresh } from './helpers/pipeline.mjs'

// The whole refresh, end to end, against the mocked network.
const run = runRefresh()
const { data } = run
const league = (platform) => data.leagues.find((entry) => entry.platform === platform)
const player = (entry, name) => entry.roster.find((candidate) => candidate.name === name)

test('the refresh completes and writes both files', () => {
  assert.equal(run.status, 0, run.log)
  assert.equal(data.week, 9)
  assert.equal(data.season, '2026')
  assert.deepEqual(data.problems, [])
  assert.deepEqual(run.stamp, { generatedAt: data.generatedAt })
  assert.equal(data.generatedAt, '2026-11-03T16:00:00.000Z')
  assert.match(run.githubOutput, /game_window=false\nhistory_changed=false/)
})

test('both platforms load into the same shape', () => {
  assert.deepEqual(data.leagues.map((entry) => [entry.id, entry.name, entry.platform]), [
    ['sleeper:L1', 'Blood, Sweat, and Beers', 'sleeper'],
    ['espn:123', 'Los Hermanos Klub', 'espn']
  ])
  for (const entry of data.leagues) {
    assert.equal(entry.roster.length, 14, entry.platform)
    assert.equal(entry.teams.length, 4)
    assert.equal(entry.record, '3-5')
    assert.equal(entry.rosterSpots, 15)
    assert.equal(entry.receptionPoints, 1)
    assert.deepEqual(entry.roster.filter((p) => p.starter).map((p) => p.slot), ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'])
    assert.equal(entry.candidates, undefined, 'the free agent pool is not shipped, only the ranked board')
  }
})

test('games, byes and injuries are attached to players', () => {
  for (const entry of data.leagues) {
    assert.equal(player(entry, 'Pat Freiermuth').game, null, 'PIT is on bye')
    assert.equal(typeof player(entry, 'Josh Allen').game.kickoffISO, 'string')
    assert.equal(player(entry, 'James Cook').injuryStatus, 'OUT')
    assert.deepEqual(player(entry, 'Josh Allen').news.map((story) => story.headline), ['Allen sharp in practice'])
  }
  assert.deepEqual(data.byeWeeks, {
    PIT: 9, TEN: 9, CHI: 10, TB: 10, PHI: 10, DEN: 10, SEA: 11, NE: 11, LAR: 11, CLE: 11, ATL: 11, GB: 11
  })
  assert.deepEqual(data.schedule.byes, ['PIT', 'TEN'])
  assert.equal(data.schedule.games.length, 15)
})

test('the schedule panel gets every later week that has games on file', () => {
  // The mocked games file runs to week 11, so weeks 12 to 18 have nothing to show.
  assert.deepEqual(
    data.laterSchedules.map((entry) => [entry.week, entry.games.length, entry.byes]),
    [
      [10, 14, ['CHI', 'DEN', 'PHI', 'TB']],
      [11, 13, ['ATL', 'CLE', 'GB', 'LAR', 'NE', 'SEA']]
    ]
  )
  for (const entry of data.laterSchedules) {
    const kickoffs = entry.games.map((game) => Date.parse(game.kickoffISO))
    assert.deepEqual(kickoffs, [...kickoffs].sort((a, b) => a - b), `week ${entry.week} is in kickoff order`)
    assert.ok(entry.games.every((game) => game.homeScore == null && game.awayScore == null), 'no scores before kickoff')
  }
})

test('this week and last week are found on both platforms', () => {
  for (const entry of data.leagues) {
    assert.deepEqual(entry.matchup, { week: 9, opponentTeamId: 2, score: 0, opponentScore: 0 })
    assert.deepEqual(entry.lastMatchup, { week: 8, opponentTeamId: 3, score: 108.4, opponentScore: 114.9 })
    assert.equal(entry.results.length, 16, 'two games a week for eight weeks')
    assert.deepEqual(entry.results.find((game) => game.week === 3 && [game.a, game.b].includes(1)), entry.platform === 'sleeper'
      ? { week: 3, a: 1, aPoints: 121.4, b: 2, bPoints: 99.2 }
      : { week: 3, a: 1, aPoints: 121.4, b: 2, bPoints: 99.2 })
  }
})

test('swing covers your roster and your opponent, and nobody else', () => {
  for (const entry of data.leagues) {
    const opponent = entry.teams.find((team) => team.teamId === 2)
    assert.deepEqual(player(entry, 'Romeo Doubs').swing, { games: 8, thisSeason: 8, mean: 12.5, sd: 10.9, low: 2, high: 23.9 })
    assert.equal(player(entry, 'Brandon Aubrey').swing, null, 'kickers have no weekly log')
    assert.equal(opponent.roster.find((p) => p.name === 'Lamar Jackson').swing.games, 7)
    assert.ok(entry.teams.filter((team) => team.teamId > 2).every((team) => team.roster.every((p) => !p.swing)))
  }
})

test('the waiver board ranks free agents and carries the bye plan', () => {
  for (const entry of data.leagues) {
    const names = entry.waivers.map((p) => p.name)
    assert.ok(names.includes('Jake Ferguson') && names.includes('Bo Nix'), names.join(', '))
    assert.ok(entry.waivers.every((p) => typeof p.score === 'number' && Array.isArray(p.reasons)))
    assert.ok(entry.byeOptions[9].some((option) => option.player.name === 'Jake Ferguson' && option.projected === 10.5))
    assert.ok(player(entry, 'Bijan Robinson').ahead[10], 'next week is planned for roster players')
    assert.equal(player(entry, 'Bijan Robinson').ahead[11], undefined, 'ATL is on bye in week 11')
  }
})

test('feed stories match rostered players, and waiver columns are read', () => {
  const headlines = data.news.map((story) => story.headline)
  assert.ok(headlines.includes("Bijan Robinson's workload keeps growing"), 'a possessive still matches')
  assert.ok(headlines.includes('Allen sharp in practice'))
  assert.ok(!headlines.some((headline) => headline.includes('Mahomes')))
  for (const entry of data.leagues) {
    assert.deepEqual(entry.consensus.map((row) => row.name).sort(), ['Jake Ferguson', 'Jalen Coker'], 'named, and not after the word drop')
  }
})

test('a second run sees the first as the previous one', () => {
  const again = runRefresh({ dir: run.dir, now: '2026-11-03T16:15:00Z' })
  assert.equal(again.status, 0, again.log)
  assert.deepEqual(again.data.changes, [], 'nothing changed between two identical runs')
  assert.equal(again.stamp.generatedAt, '2026-11-03T16:15:00.000Z')
})

test('in the NFL playoffs the dashboard stays on the last week', () => {
  const january = runRefresh({ now: '2027-01-12T16:00:00Z', week: 1, env: { MOCK_SEASON_TYPE: 'post' } })
  assert.equal(january.status, 0, january.log)
  assert.equal(january.data.week, 18)
  assert.deepEqual(january.data.laterSchedules, [], 'no regular season weeks are left to show')
})
