export const RANKS = [
  ['1', 'Рекрут', 'Herald'], ['2', 'Страж', 'Guardian'],
  ['3', 'Рыцарь', 'Crusader'], ['4', 'Герой', 'Archon'],
  ['5', 'Легенда', 'Legend'], ['6', 'Властелин', 'Ancient'],
  ['7', 'Божество', 'Divine'], ['8', 'Титан', 'Immortal'],
]

export const ATTRIBUTES = { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсальный' }
export const ROLES = {
  Carry: 'Керри', Support: 'Поддержка', Nuker: 'Магический урон',
  Disabler: 'Контроль', Durable: 'Выживаемость', Escape: 'Мобильность',
  Pusher: 'Снос строений', Initiator: 'Инициация', Jungler: 'Лес',
}
export const DEFAULT_FILTERS = {
  query: '', sample: 'pub', days: '7', ranks: RANKS.map(([id]) => id),
  attribute: 'any', role: 'any', attack: 'any', minPicks: '', minWin: '', maxWin: '',
}

const validCount = (value) => Number.isFinite(value) && value >= 0
export const rate = (wins, picks) => validCount(wins) && picks > 0 ? 100 * wins / picks : null
export const number = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'
export const percentage = (value) => Number.isFinite(value) ? `${number(value, 2)}%` : '—'

export function getTrend(hero, sample) {
  const prefix = sample === 'turbo' ? 'turbo' : sample === 'pub' ? 'pub' : null
  if (!prefix) return []
  const picks = hero[`${prefix}_${prefix === 'turbo' ? 'picks' : 'pick'}_trend`]
  const wins = hero[`${prefix}_${prefix === 'turbo' ? 'wins' : 'win'}_trend`]
  if (!Array.isArray(picks) || !Array.isArray(wins) || picks.length !== 7 || wins.length !== 7) return []
  return picks.map((count, index) => ({ picks: count, wins: wins[index], winRate: rate(wins[index], count) }))
}

export function heroTotals(hero, { sample, days = '7', ranks = DEFAULT_FILTERS.ranks }) {
  if (sample === 'ranked') {
    if (!ranks.length) return { picks: 0, wins: 0 }
    const counts = ranks.map((rank) => ({ picks: hero[`${rank}_pick`], wins: hero[`${rank}_win`] }))
    if (counts.some(({ picks, wins }) => !validCount(picks) || !validCount(wins))) return { picks: null, wins: null }
    return counts.reduce((total, row) => ({ picks: total.picks + row.picks, wins: total.wins + row.wins }), { picks: 0, wins: 0 })
  }
  if ((sample === 'pub' || sample === 'turbo') && days !== '7') {
    const trend = getTrend(hero, sample)
    const selected = trend.slice(-Number(days))
    if (!selected.length || selected.some(({ picks, wins }) => !validCount(picks) || !validCount(wins))) return { picks: null, wins: null }
    return selected.reduce((total, day) => ({ picks: total.picks + day.picks, wins: total.wins + day.wins }), { picks: 0, wins: 0 })
  }
  const picks = hero[sample === 'turbo' ? 'turbo_picks' : `${sample}_pick`]
  const wins = hero[sample === 'turbo' ? 'turbo_wins' : `${sample}_win`]
  return { picks: validCount(picks) ? picks : null, wins: validCount(wins) ? wins : null }
}

// Wilson score interval keeps small samples from looking more certain than they are.
export function confidenceInterval(wins, picks) {
  if (!picks || !validCount(wins)) return null
  const z = 1.96
  const proportion = wins / picks
  const denominator = 1 + z * z / picks
  const center = (proportion + z * z / (2 * picks)) / denominator
  const half = z * Math.sqrt(proportion * (1 - proportion) / picks + z * z / (4 * picks * picks)) / denominator
  return [100 * Math.max(0, center - half), 100 * Math.min(1, center + half)]
}

export function buildRows(heroes, filters) {
  const rows = heroes.map((hero) => {
    const { picks, wins } = heroTotals(hero, filters)
    const trend = getTrend(hero, filters.sample)
    const first = trend.at(0)?.winRate
    const last = trend.at(-1)?.winRate
    return {
      ...hero, picks, wins, winRate: rate(wins, picks),
      losses: picks !== null && wins !== null ? picks - wins : null,
      bans: filters.sample === 'pro' && validCount(hero.pro_ban) ? hero.pro_ban : null,
      confidence: confidenceInterval(wins, picks), trend,
      change: first != null && last != null ? last - first : null,
    }
  })
  // Calculate the denominator BEFORE UI filters; searching cannot inflate pick rate.
  const totalPicks = rows.reduce((sum, hero) => sum + (hero.picks ?? 0), 0)
  const estimatedMatches = totalPicks / 10
  return rows.map((row) => ({ ...row, pickRate: estimatedMatches > 0 && row.picks !== null ? 100 * row.picks / estimatedMatches : null }))
}

export function filterRows(rows, filters) {
  const query = filters.query.trim().toLocaleLowerCase()
  return rows.filter((row) =>
    row.localized_name.toLocaleLowerCase().includes(query)
    && (filters.attribute === 'any' || row.primary_attr === filters.attribute)
    && (filters.role === 'any' || row.roles.includes(filters.role))
    && (filters.attack === 'any' || row.attack_type === filters.attack)
    && (filters.minPicks === '' || (row.picks !== null && row.picks >= Number(filters.minPicks)))
    && (filters.minWin === '' || (row.winRate !== null && row.winRate >= Number(filters.minWin)))
    && (filters.maxWin === '' || (row.winRate !== null && row.winRate <= Number(filters.maxWin)))
  )
} 

export function sortRows(rows, key, direction = 'desc') {
  const getValue = (row) => key.startsWith('rank-')
    ? rate(row[`${key.slice(5)}_win`], row[`${key.slice(5)}_pick`]) : row[key]
  return [...rows].sort((a, b) => {
    const left = getValue(a)
    const right = getValue(b)
    if (left == null && right == null) return a.localized_name.localeCompare(b.localized_name)
    if (left == null) return 1
    if (right == null) return -1
    const difference = typeof left === 'string' ? left.localeCompare(right) : left - right
    return (direction === 'asc' ? difference : -difference) || a.localized_name.localeCompare(b.localized_name)
  })
}
