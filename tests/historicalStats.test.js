import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_HISTORY_FILTERS, availablePatches, buildHistoryQuery, normalizeHistoryFilters, parseHistoryResponse } from '../src/lib/historicalStats.js'

const now = Date.parse('2026-09-18T15:30:00Z')

test('custom dates use UTC and include the entire end date, without future time', () => {
  const result = normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, period: 'dates', from: '2026-08-01', to: '2026-08-03' }, [], now)
  assert.equal(result.start, Date.parse('2026-08-01T00:00:00Z') / 1000)
  assert.equal(result.end, Date.parse('2026-08-04T00:00:00Z') / 1000)
  const today = normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, period: 'dates', from: '2026-09-18', to: '2026-09-18' }, [], now)
  assert.equal(today.end, now / 1000)
})

test('patches retain exact boundaries and clip only unavailable history', () => {
  const patches = availablePatches([{ name: '7.39', date: '2025-05-22T23:36:01.602Z' }, { name: '7.40', date: '2025-12-16T00:50:40.281Z' }, { name: '7.41', date: '2026-03-24T00:50:59.580Z' }], now)
  assert.deepEqual(patches.map((patch) => patch.name), ['7.41', '7.40', '7.39'])
  const middle = normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, period: 'patch', patch: '7.40' }, patches, now)
  assert.equal(middle.start, Math.ceil(Date.parse('2025-12-16T00:50:40.281Z') / 1000))
  assert.equal(middle.end, Math.ceil(Date.parse('2026-03-24T00:50:59.580Z') / 1000))
  const partial = normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, period: 'patch', patch: '7.39' }, patches, now)
  assert.equal(partial.clipped, true)
  assert.equal(partial.start, Date.parse('2025-09-18T15:30:00Z') / 1000)
})

test('invalid or unsupported filter values never enter SQL', () => {
  for (const override of [{ rank: '1; DROP TABLE matches' }, { lobby: '__proto__' }, { mode: '23 OR TRUE' }, { period: 'dates', from: '2026-02-30', to: '2026-03-01' }, { period: 'dates', from: '2025-09-01', to: '2026-03-01' }, { period: 'dates', from: '2026-10-01', to: '2026-10-03' }, { period: 'patch', patch: 'unknown' }, { mode: 'turbo', lobby: 'ranked' }]) {
    assert.throws(() => normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, ...override }, [], now))
  }
  const valid = normalizeHistoryFilters(DEFAULT_HISTORY_FILTERS, [], now)
  assert.throws(() => buildHistoryQuery({ ...valid, start: '0 OR TRUE' }))
  assert.throws(() => buildHistoryQuery({ ...valid, rank: '8 OR TRUE' }))
  assert.throws(() => buildHistoryQuery({ ...valid, end: valid.start + 999999999 }))
})

test('query filters gameplay dates, actual lobbies and match average rank before limiting', () => {
  const query = buildHistoryQuery(normalizeHistoryFilters({ ...DEFAULT_HISTORY_FILTERS, rank: '6', lobby: 'ranked', mode: 'all-pick' }, [], now))
  assert.match(query, /avg_rank_tier >= 60 AND avg_rank_tier < 70/)
  assert.match(query, /lobby_type IN \(5, 6, 7\)/)
  assert.match(query, /game_mode IN \(1, 22\)/)
  assert.match(query, /ORDER BY start_time DESC, match_id DESC LIMIT 20000/)
  assert.match(query, /SELECT count\(\*\) FROM sample/)
  assert.match(query, /unnest\(radiant_team\)/)
  assert.match(query, /unnest\(dire_team\)/)
})

test('win and pick rates use actual sampled matches, while empty samples stay empty', () => {
  const data = { rows: [{ sample_matches: '2', first_match_time: '100', last_match_time: '200', heroes: Array.from({ length: 10 }, (_, index) => ({ hero_id: index + 1, picks: '2', wins: '1' })) }] }
  const result = parseHistoryResponse(data)
  assert.equal(result.matches, 2)
  assert.equal(result.rows[0].winRate, 50)
  assert.equal(result.rows[0].pickRate, 100)
  assert.deepEqual(parseHistoryResponse({ rows: [{ sample_matches: 0, first_match_time: null, last_match_time: null, heroes: [] }] }), { matches: 0, first: null, last: null, rows: [], capped: false })
  assert.throws(() => parseHistoryResponse({ rows: [{ ...data.rows[0], heroes: data.rows[0].heroes.slice(1) }] }))
  assert.throws(() => parseHistoryResponse({ err: 'timeout', rows: [] }))
})
