import test from 'node:test'
import assert from 'node:assert/strict'

// seen.js also holds a React hook. Only its plain functions are tested here, and
// the hook is covered by the browser tests.
const { isUnseen, latestChange, unseenCounts } = await import('../web/src/lib/seen.js')

const at = (minutes) => new Date(Date.UTC(2026, 10, 15, 12, minutes)).toISOString()
const changes = [
  { key: 'a', leagueId: 'sleeper:1', detectedAt: at(0) },
  { key: 'b', leagueId: 'sleeper:1', detectedAt: at(30) },
  { key: 'c', leagueId: 'espn:2', detectedAt: at(10) },
  { key: 'd', leagueId: 'espn:2', detectedAt: null }
]

test('the newest change per league', () => {
  assert.equal(latestChange(changes, 'sleeper:1'), Date.parse(at(30)))
  assert.equal(latestChange(changes, 'espn:2'), Date.parse(at(10)))
  assert.equal(latestChange(changes, 'none'), 0)
  assert.equal(latestChange(undefined, 'sleeper:1'), 0)
})

test('a change is unseen when it was detected after the last look', () => {
  assert.equal(isUnseen(changes[1], Date.parse(at(0))), true)
  assert.equal(isUnseen(changes[0], Date.parse(at(0))), false, 'the one that was on screen is seen')
  assert.equal(isUnseen(changes[0], undefined), true, 'never looked: everything is new')
  assert.equal(isUnseen(changes[3], 0), false, 'a change with no time is never flagged')
})

test('badge counts per league', () => {
  assert.deepEqual([...unseenCounts(changes, {})], [['sleeper:1', 2], ['espn:2', 1]])
  assert.deepEqual([...unseenCounts(changes, { 'sleeper:1': Date.parse(at(0)), 'espn:2': Date.parse(at(10)) })], [['sleeper:1', 1]])
  assert.deepEqual([...unseenCounts(changes, { 'sleeper:1': Date.parse(at(30)), 'espn:2': Date.parse(at(10)) })], [])
  assert.deepEqual([...unseenCounts(null, null)], [])
})
