import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FILTERS,
  buildRows,
  confidenceInterval,
  filterRows,
  getTrend,
  heroTotals,
  rate,
  sortRows,
} from '../src/lib/heroStats.js'

const filters = (overrides = {}) => ({ ...DEFAULT_FILTERS, ...overrides })

function hero(overrides = {}) {
  return {
    id: 1,
    localized_name: 'Alpha',
    primary_attr: 'str',
    roles: ['Carry', 'Durable'],
    attack_type: 'Melee',
    pub_pick: 1000,
    pub_win: 600,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      [`${index + 1}_pick`, 10], [`${index + 1}_win`, 4],
    ]).flat()),
    ...overrides,
  }
}

const dailyCounts = {
  pub_pick_trend: [10, 20, 30, 40, 50, 60, 70],
  pub_win_trend: [1, 3, 6, 10, 20, 30, 49],
}

test('public totals use API public counters, independently of rank buckets', () => {
  const [row] = buildRows([hero()], filters())
  assert.equal(row.picks, 1000)
  assert.equal(row.wins, 600)
  assert.equal(row.winRate, 60)
  assert.equal(row.losses, 400)
  assert.deepEqual(heroTotals(hero(), filters({ sample: 'ranked' })), { picks: 80, wins: 32 })
})

test('selected average-match rank groups use a weighted win rate', () => {
  const entry = hero({ '1_pick': 1, '1_win': 1, '8_pick': 99, '8_win': 49 })
  const [row] = buildRows([entry], filters({ sample: 'ranked', ranks: ['1', '8'] }))
  assert.equal(row.picks, 100)
  assert.equal(row.wins, 50)
  assert.equal(row.winRate, 50)
  assert.deepEqual(heroTotals(entry, filters({ sample: 'ranked', ranks: [] })), { picks: 0, wins: 0 })
})

test('missing selected rank groups do not silently produce incomplete totals', () => {
  const entry = hero({ '8_pick': undefined, '8_win': undefined })
  const [row] = buildRows([entry], filters({ sample: 'ranked', ranks: ['1', '8'] }))
  assert.equal(row.picks, null)
  assert.equal(row.wins, null)
  assert.equal(row.winRate, null)
  assert.deepEqual(heroTotals(entry, filters({ sample: 'ranked', ranks: ['1'] })), { picks: 10, wins: 4 })
})

test('Turbo uses plural API keys for totals and trend counts', () => {
  const entry = hero({
    turbo_picks: 45, turbo_wins: 30,
    turbo_pick: 1500, turbo_win: 1500,
    turbo_picks_trend: dailyCounts.pub_pick_trend,
    turbo_wins_trend: dailyCounts.pub_win_trend,
  })
  assert.deepEqual(heroTotals(entry, filters({ sample: 'turbo' })), { picks: 45, wins: 30 })
  assert.deepEqual(heroTotals(entry, filters({ sample: 'turbo', days: '1' })), { picks: 70, wins: 49 })
  assert.equal(getTrend(entry, 'turbo').at(-1).winRate, 70)
})

test('one- and three-day windows aggregate the latest trend entries', () => {
  const entry = hero(dailyCounts)
  assert.deepEqual(heroTotals(entry, filters({ days: '1' })), { picks: 70, wins: 49 })
  assert.deepEqual(heroTotals(entry, filters({ days: '3' })), { picks: 180, wins: 99 })
  assert.deepEqual(heroTotals(entry, filters({ days: '7' })), { picks: 1000, wins: 600 })
  const [row] = buildRows([entry], filters({ days: '3' }))
  assert.equal(row.winRate, 55)
})

test('absent or incomplete trends make short-period totals unavailable', () => {
  for (const entry of [hero(), hero({ pub_pick_trend: [10], pub_win_trend: [5] })]) {
    assert.deepEqual(getTrend(entry, 'pub'), [])
    assert.deepEqual(heroTotals(entry, filters({ days: '1' })), { picks: null, wins: null })
    assert.equal(buildRows([entry], filters({ days: '1' }))[0].winRate, null)
  }
})

test('missing daily counters cannot be treated as zero in period totals', () => {
  for (const missing of [null, undefined, Number.NaN]) {
    const entry = hero({
      ...dailyCounts,
      pub_win_trend: [1, 3, 6, 10, 20, 30, missing],
    })
    const [row] = buildRows([entry], filters({ days: '1' }))
    assert.equal(row.winRate, null)
    assert.equal(row.wins, null)
  }
})

test('pick rate denominator includes all heroes before UI filters', () => {
  const heroes = Array.from({ length: 20 }, (_, index) => hero({
    id: index + 1,
    localized_name: index === 0 ? 'Alpha' : `Other ${index}`,
    pub_pick: 100,
    pub_win: 50,
  }))
  const selectedFilters = filters({ query: 'Alpha' })
  const rows = buildRows(heroes, selectedFilters)
  const selected = filterRows(rows, selectedFilters)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].pickRate, 50)
  assert.equal(rows.reduce((total, row) => total + row.pickRate, 0), 1000)
})

test('missing and zero sample data never manufacture a win percentage', () => {
  for (const [wins, picks] of [[undefined, 10], [null, 10], [0, 0], [0, null]]) {
    assert.equal(rate(wins, picks), null)
  }
  const [empty, missing] = buildRows([
    hero({ id: 1, pub_pick: 0, pub_win: 0 }),
    hero({ id: 2, pub_pick: undefined, pub_win: undefined }),
  ], filters())
  for (const row of [empty, missing]) {
    assert.equal(row.winRate, null)
    assert.equal(row.pickRate, null)
    assert.equal(row.confidence, null)
  }
  assert.equal(empty.picks, 0)
  assert.equal(missing.picks, null)
  assert.equal(rate(0, 10), 0)
})

test('null statistics sort last in both directions without mutating input', () => {
  const rows = [
    { localized_name: 'Missing', winRate: null },
    { localized_name: 'High', winRate: 70 },
    { localized_name: 'Low', winRate: 40 },
  ]
  assert.deepEqual(sortRows(rows, 'winRate', 'asc').map((row) => row.localized_name), ['Low', 'High', 'Missing'])
  assert.deepEqual(sortRows(rows, 'winRate', 'desc').map((row) => row.localized_name), ['High', 'Low', 'Missing'])
  assert.deepEqual(rows.map((row) => row.localized_name), ['Missing', 'High', 'Low'])
})

test('rank columns sort by win rate with absent groups last', () => {
  const rows = [
    hero({ localized_name: 'Missing', '8_pick': undefined, '8_win': undefined }),
    hero({ localized_name: 'High', '8_pick': 100, '8_win': 70 }),
    hero({ localized_name: 'Low', '8_pick': 10, '8_win': 4 }),
  ]
  assert.deepEqual(sortRows(rows, 'rank-8', 'asc').map((row) => row.localized_name), ['Low', 'High', 'Missing'])
  assert.deepEqual(sortRows(rows, 'rank-8', 'desc').map((row) => row.localized_name), ['High', 'Low', 'Missing'])
})

test('universal attribute is distinct from the any-attribute selection', () => {
  const rows = buildRows([hero(), hero({ id: 2, primary_attr: 'all', localized_name: 'Universal' })], filters())
  assert.equal(filterRows(rows, filters({ attribute: 'any' })).length, 2)
  assert.deepEqual(filterRows(rows, filters({ attribute: 'all' })).map((row) => row.localized_name), ['Universal'])
})

test('search, role, attack, sample size and win-rate filters combine', () => {
  const rows = buildRows([
    hero({ localized_name: 'Crystal Maiden', roles: ['Support', 'Nuker'], attack_type: 'Ranged', pub_pick: 200, pub_win: 110 }),
    hero({ id: 2, localized_name: 'Crystal Carry', roles: ['Carry'], attack_type: 'Ranged', pub_pick: 200, pub_win: 110 }),
    hero({ id: 3, localized_name: 'Crystal Tiny Sample', roles: ['Support'], attack_type: 'Ranged', pub_pick: 2, pub_win: 1 }),
    hero({ id: 4, localized_name: 'Crystal Melee', roles: ['Support'], attack_type: 'Melee', pub_pick: 200, pub_win: 110 }),
    hero({ id: 5, localized_name: 'Crystal High', roles: ['Support'], attack_type: 'Ranged', pub_pick: 200, pub_win: 150 }),
    hero({ id: 6, localized_name: 'Crystal Low', roles: ['Support'], attack_type: 'Ranged', pub_pick: 200, pub_win: 80 }),
  ], filters())
  const selected = filterRows(rows, filters({
    query: '  cRyStAl ', role: 'Support', attack: 'Ranged', minPicks: '100', minWin: '50', maxWin: '60',
  }))
  assert.deepEqual(selected.map((row) => row.localized_name), ['Crystal Maiden'])
})

test('pro counters and bans remain separate from public data', () => {
  const entry = hero({ pro_pick: 20, pro_win: 12, pro_ban: 35 })
  const [pro] = buildRows([entry], filters({ sample: 'pro' }))
  assert.equal(pro.picks, 20)
  assert.equal(pro.winRate, 60)
  assert.equal(pro.bans, 35)
  assert.equal(buildRows([entry], filters())[0].bans, null)
  assert.deepEqual(getTrend(entry, 'pro'), [])
})

test('Wilson confidence interval reflects sample size and boundary rates', () => {
  const [lower, upper] = confidenceInterval(50, 100)
  assert.ok(Math.abs(lower - 40.383) < 0.001)
  assert.ok(Math.abs(upper - 59.617) < 0.001)
  const [smallLower, smallUpper] = confidenceInterval(5, 10)
  assert.ok(smallLower < lower)
  assert.ok(smallUpper > upper)
  assert.ok(Math.abs(confidenceInterval(0, 10)[0]) < 1e-10)
  assert.ok(confidenceInterval(0, 10)[1] > 0)
  assert.ok(confidenceInterval(10, 10)[0] < 100)
  assert.equal(confidenceInterval(10, 10)[1], 100)
  assert.equal(confidenceInterval(0, 0), null)
  assert.equal(confidenceInterval(null, 100), null)
})
