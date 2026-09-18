const API_ROOT = 'https://api.opendota.com/api'
const DAY = 86400000
export const HISTORY_LIMIT = 20000
export const HISTORY_RANKS = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal']
export const HISTORY_MODES = { all: 'Стандартные + Turbo', 'all-pick': 'All Pick', turbo: 'Turbo' }
export const HISTORY_LOBBIES = { all: 'Все паблики', ranked: 'Рейтинговые', normal: 'Обычные' }
export const DEFAULT_HISTORY_FILTERS = { period: '7', patch: '', from: '', to: '', rank: 'all', lobby: 'all', mode: 'all' }

export function historyBounds(now = Date.now()) {
  const minimum = new Date(now)
  minimum.setUTCFullYear(minimum.getUTCFullYear() - 1)
  return { minimum: minimum.getTime(), maximum: now, minDate: minimum.toISOString().slice(0, 10), maxDate: new Date(now).toISOString().slice(0, 10) }
}

export function availablePatches(data, now = Date.now()) {
  if (!Array.isArray(data)) throw new Error('Не удалось прочитать список патчей OpenDota.')
  const patches = data.filter((patch) => patch && typeof patch.name === 'string' && /^[\d.]+[a-z]?$/.test(patch.name) && Number.isFinite(Date.parse(patch.date)))
    .map((patch) => ({ name: patch.name, start: Date.parse(patch.date) }))
    .sort((a, b) => a.start - b.start)
  const { minimum } = historyBounds(now)
  return patches.map((patch, index) => ({ ...patch, end: patches[index + 1]?.start ?? now }))
    .filter((patch) => patch.end > minimum && patch.start < now)
    .reverse()
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Укажите обе даты периода.')
  const time = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Проверьте даты периода.')
  return time
}

export function normalizeHistoryFilters(filters, patches = [], now = Date.now()) {
  const { minimum, maximum, minDate, maxDate } = historyBounds(now)
  if (!Object.hasOwn(HISTORY_MODES, filters.mode) || !Object.hasOwn(HISTORY_LOBBIES, filters.lobby)
    || !['all', '1', '2', '3', '4', '5', '6', '7', '8'].includes(filters.rank)) throw new Error('Проверьте фильтры режима и ранга.')
  if (filters.mode === 'turbo' && filters.lobby === 'ranked') throw new Error('Для Turbo выберите обычные матчи или все паблики.')
  let start
  let end = maximum
  let label
  if (['7', '30', '90'].includes(filters.period)) {
    start = now - Number(filters.period) * DAY
    label = `Последние ${filters.period} дней`
  } else if (filters.period === 'dates') {
    start = dateValue(filters.from)
    end = dateValue(filters.to) + DAY
    if (filters.from < minDate || filters.to > maxDate) throw new Error('Выберите даты в пределах последних 12 месяцев.')
    if (filters.from > filters.to) throw new Error('Начало периода должно быть не позже окончания.')
    label = `${filters.from} — ${filters.to} (UTC)`
  } else if (filters.period === 'patch') {
    const patch = patches.find((entry) => entry.name === filters.patch)
    if (!patch || !Number.isFinite(patch.start) || !Number.isFinite(patch.end)) throw new Error('Выберите патч из списка OpenDota.')
    start = patch.start
    end = patch.end
    label = `Патч ${patch.name} по справочнику OpenDota`
  } else {
    throw new Error('Выберите допустимый период.')
  }
  const clipped = start < minimum
  start = Math.max(start, minimum)
  end = Math.min(end, maximum)
  if (start >= end) throw new Error('Для этого периода нет доступного диапазона дат.')
  return { start: Math.ceil(start / 1000), end: Math.ceil(end / 1000), rank: filters.rank, lobby: filters.lobby, mode: filters.mode, label, clipped }
}

// Only validated integers and clauses selected from constants enter this SQL.
// public_matches is OpenDota's historical sample, not the complete heroStats population.
export function buildHistoryQuery(filters) {
  const { start, end, rank, lobby, mode } = filters
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 367 * DAY / 1000
    || !['all', '1', '2', '3', '4', '5', '6', '7', '8'].includes(rank)
    || !Object.hasOwn(HISTORY_LOBBIES, lobby) || !Object.hasOwn(HISTORY_MODES, mode)) throw new Error('Некорректный запрос периода.')
  const lobbyClause = { all: 'lobby_type IN (0, 5, 6, 7)', ranked: 'lobby_type IN (5, 6, 7)', normal: 'lobby_type = 0' }[lobby]
  const modeClause = { all: 'game_mode IN (1, 2, 3, 4, 5, 12, 16, 17, 22, 23)', 'all-pick': 'game_mode IN (1, 22)', turbo: 'game_mode = 23' }[mode]
  const rankClause = rank === 'all' ? '' : `AND avg_rank_tier >= ${Number(rank) * 10} AND avg_rank_tier < ${(Number(rank) + 1) * 10}`
  return `WITH sample AS MATERIALIZED (
    SELECT match_id, start_time, radiant_win, radiant_team, dire_team
    FROM public_matches
    WHERE start_time >= ${start} AND start_time < ${end}
      AND ${lobbyClause} AND ${modeClause} ${rankClause}
      AND duration > 360 AND radiant_win IS NOT NULL
      AND array_length(radiant_team, 1) = 5 AND array_length(dire_team, 1) = 5
      AND 0 <> ALL(radiant_team) AND 0 <> ALL(dire_team)
      AND array_position(radiant_team, NULL) IS NULL AND array_position(dire_team, NULL) IS NULL
    ORDER BY start_time DESC, match_id DESC LIMIT ${HISTORY_LIMIT}
  ), appearances AS (
    SELECT hero_id, CASE WHEN radiant_win THEN 1 ELSE 0 END AS won
    FROM sample CROSS JOIN LATERAL unnest(radiant_team) AS hero_id
    UNION ALL
    SELECT hero_id, CASE WHEN radiant_win THEN 0 ELSE 1 END AS won
    FROM sample CROSS JOIN LATERAL unnest(dire_team) AS hero_id
  ), hero_stats AS (
    SELECT hero_id, count(*) AS picks, sum(won) AS wins
    FROM appearances GROUP BY hero_id
  )
  SELECT (SELECT count(*) FROM sample) AS sample_matches,
    (SELECT min(start_time) FROM sample) AS first_match_time,
    (SELECT max(start_time) FROM sample) AS last_match_time,
    COALESCE((SELECT json_agg(hero_stats ORDER BY picks DESC) FROM hero_stats), '[]'::json) AS heroes`
}

function count(value) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

export function parseHistoryResponse(data) {
  const result = data?.rows?.[0]
  if (data?.err || !result || !Array.isArray(result.heroes)) throw new Error('OpenDota не вернул корректную выборку. Попробуйте уменьшить период.')
  const matches = count(result.sample_matches)
  if (matches === null || matches > HISTORY_LIMIT) throw new Error('Некорректный размер выборки OpenDota.')
  const rows = result.heroes.map((hero) => {
    const id = count(hero.hero_id)
    const picks = count(hero.picks)
    const wins = count(hero.wins)
    if (!id || picks === null || wins === null || wins > picks || picks > matches) throw new Error('Некорректная статистика героя в выборке.')
    return { id, picks, wins, winRate: picks ? wins / picks * 100 : null, pickRate: matches ? picks / matches * 100 : null }
  })
  if (rows.reduce((sum, hero) => sum + hero.picks, 0) !== matches * 10 || rows.reduce((sum, hero) => sum + hero.wins, 0) !== matches * 5) {
    throw new Error('Выборка содержит неполные матчи. Попробуйте другой период или режим.')
  }
  const first = result.first_match_time == null ? null : count(result.first_match_time)
  const last = result.last_match_time == null ? null : count(result.last_match_time)
  if (matches > 0 && (first === null || last === null || first > last)) throw new Error('Не удалось проверить даты выборки.')
  return { matches, rows, first, last, capped: matches === HISTORY_LIMIT }
}

export async function fetchHistory(filters, signal) {
  const response = await fetch(`${API_ROOT}/explorer?${new URLSearchParams({ sql: buildHistoryQuery(filters) })}`, { signal })
  if (!response.ok) throw new Error(response.status === 429 ? 'Лимит запросов OpenDota. Подождите минуту и повторите.' : `OpenDota временно не выполнил запрос (HTTP ${response.status}). Попробуйте меньший период.`)
  return parseHistoryResponse(await response.json())
}

export async function fetchHistoryPatches(signal) {
  const response = await fetch(`${API_ROOT}/constants/patch`, { signal })
  if (!response.ok) throw new Error('Список патчей временно недоступен. Можно выбрать период по датам.')
  return availablePatches(await response.json())
}
