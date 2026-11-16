import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleDays, weekCaption, weekDates } from '../web/src/lib/nflSchedule.js'

// The schedule panel's helpers. Dates format in the device's time zone, so the
// games here sit at midday UTC, which is the same day almost everywhere.
const game = (away, home, kickoffISO, scores = {}) => ({ away, home, kickoffISO, ...scores })
const games = [
  game('BUF', 'MIA', '2026-11-19T12:00:00Z'),
  game('KC', 'DEN', '2026-11-22T12:00:00Z'),
  game('DAL', 'NYG', '2026-11-23T12:00:00Z')
]
const before = Date.parse('2026-11-18T12:00:00Z')

test('this week marks the next game, and a later week marks none', () => {
  const current = (days) => days.flatMap((day) => day.games).filter((entry) => entry.current).map((entry) => entry.away)
  assert.deepEqual(current(scheduleDays(games, before)), ['BUF'])
  assert.deepEqual(current(scheduleDays(games, before, { markCurrent: false })), [])
  assert.deepEqual(scheduleDays(games, before).map((day) => day.games.length), [1, 1, 1])
})

test('each week is named from the week being played', () => {
  assert.equal(weekCaption(11, 11), 'This week')
  assert.equal(weekCaption(12, 11), 'Next week')
  assert.equal(weekCaption(14, 11), 'In 3 weeks')
})

test("a week's dates run from its first game to its last", () => {
  const range = weekDates(games)
  assert.match(range, /19/)
  assert.match(range, /23/)
  assert.doesNotMatch(range, /22/, 'only the ends of the week')
  assert.equal(weekDates([games[0]]), weekDates([games[0], { ...games[0], away: 'NE' }]), 'one day reads as one date')
  assert.doesNotMatch(weekDates([games[0]]), /[–-]/)
  assert.equal(weekDates([]), null)
  assert.equal(weekDates([{ away: 'NE', home: 'NYJ', kickoffISO: null }]), null, 'no kickoff times yet')
})
