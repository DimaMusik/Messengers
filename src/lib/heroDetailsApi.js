const API_ROOT = 'https://api.opendota.com/api'
const CACHE_TTL = 10 * 60 * 1000
const cache = new Map()

export const ITEM_PERIODS = [7, 30, 90, 365, 'all']
export const ITEM_STAGES = [
    { key: 'start_game_items', label: 'Старт', note: 'До выхода крипов · стоимость до 600' },
    { key: 'early_game_items', label: '0–10 минут', note: 'Покупки дороже или равные 500 золота' },
    { key: 'mid_game_items', label: '10–25 минут', note: 'Покупки дороже или равные 1 000 золота' },
    { key: 'late_game_items', label: 'После 25 минут', note: 'Покупки дороже или равные 2 000 золота' },
]
 
export function finiteNumber(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

export function winPercent(wins, games) {
    const numerator = finiteNumber(wins)
    const denominator = finiteNumber(games)
    return numerator !== null && denominator > 0 && numerator >= 0 && numerator <= denominator
        ? numerator / denominator * 100 : null
}

export function heroWon(match) {
    if (typeof match.radiant_win !== 'boolean') return null
    const slot = finiteNumber(match.player_slot)
    const radiant = slot !== null ? slot < 128 : match.radiant
    return typeof radiant === 'boolean' ? radiant === match.radiant_win : null
}

export function itemCategory(item) {
    if (item?.qual === 'consumable' || item?.qual === 'consumables') return 'consumable'
    if (item?.created || (Array.isArray(item?.components) && item.components.length)) return 'upgrade'
    return 'component'
}

export function itemWinSql(heroId, period = 90) {
    const id = Number(heroId)
    if (!Number.isInteger(id) || id < 1 || !ITEM_PERIODS.includes(period)) throw new Error('Некорректные параметры героя или периода.')
    const dateCondition = period === 'all' ? '' : `AND m.start_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '${period} days')`
    // Deduplicate purchases per player/match. Buying consumables repeatedly must not inflate wins.
    return `WITH sample AS (
        SELECT pm.match_id, pm.player_slot, pm.purchase_log, m.start_time,
            ((pm.player_slot < 128) = m.radiant_win)::int AS won
        FROM player_matches pm JOIN matches m USING (match_id)
        WHERE pm.hero_id = ${id} AND m.version IS NOT NULL
            AND pm.purchase_log IS NOT NULL AND cardinality(pm.purchase_log) > 0
            ${dateCondition}
        ORDER BY pm.match_id DESC LIMIT 500
    ), purchases AS (
        SELECT s.match_id, s.player_slot, s.won, entry->>'key' AS item,
            MIN((entry->>'time')::numeric) AS first_purchase_time
        FROM sample s CROSS JOIN LATERAL unnest(s.purchase_log) AS entry
        WHERE entry->>'key' IS NOT NULL
        GROUP BY s.match_id, s.player_slot, s.won, entry->>'key'
    ), summary AS (
        SELECT count(*) AS sample_games, sum(won) AS sample_wins,
            min(start_time) AS first_match, max(start_time) AS last_match FROM sample
    )
    SELECT p.item, count(p.item) AS games, sum(p.won) AS wins,
        round(avg(p.first_purchase_time)) AS avg_first_purchase,
        summary.sample_games, summary.sample_wins, summary.first_match, summary.last_match
    FROM summary LEFT JOIN purchases p ON true
    GROUP BY p.item, summary.sample_games, summary.sample_wins, summary.first_match, summary.last_match
    ORDER BY games DESC`
}

export async function getDetailJson(path, { signal, force = false } = {}) {
    const saved = cache.get(path)
    if (!force && saved && Date.now() - saved.time < CACHE_TTL) return saved.data
    const controller = new AbortController()
    const cancel = () => controller.abort()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    signal?.addEventListener('abort', cancel, { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 45000)
    try {
        const response = await fetch(`${API_ROOT}${path}`, { signal: controller.signal })
        if (!response.ok) {
            throw new Error(response.status === 429
                ? 'OpenDota ограничил число запросов. Подождите минуту и повторите.'
                : `OpenDota временно недоступен (HTTP ${response.status}).`)
        }
        const data = await response.json()
        if (data?.error) throw new Error('OpenDota не смог выполнить запрос. Попробуйте ещё раз.')
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        cache.set(path, { data, time: Date.now() })
        return data
    } catch (error) {
        if (timedOut) throw new Error('OpenDota долго отвечает. Повторите загрузку чуть позже.')
        if (error.name === 'AbortError' || error.message.startsWith('OpenDota')) throw error
        throw new Error('Не удалось связаться с OpenDota. Проверьте соединение и повторите.')
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
    }
}

export async function loadHeroPanel(heroId, panel, options = {}) {
    const base = `/heroes/${Number(heroId)}`
    const paths = {
        items: `${base}/itemPopularity`,
        itemWins: `/explorer?sql=${encodeURIComponent(itemWinSql(heroId, options.period ?? 90))}`,
        matchups: `${base}/matchups`,
        durations: `${base}/durations`,
        benchmarks: `/benchmarks?hero_id=${Number(heroId)}`,
        matches: `${base}/matches`,
    }
    if (!paths[panel]) throw new Error('Неизвестный раздел.')
    const needsItems = panel === 'items' || panel === 'itemWins'
    const [main, constants] = await Promise.allSettled([
        getDetailJson(paths[panel], options),
        needsItems ? getDetailJson('/constants/items', options) : Promise.resolve(null),
    ])
    if (main.status === 'rejected') throw main.reason
    const data = main.value
    if (panel === 'itemWins' && !Array.isArray(data?.rows)) throw new Error('OpenDota не вернул данные покупок. Повторите запрос.')
    if (['matchups', 'durations', 'matches'].includes(panel) && !Array.isArray(data)) throw new Error('OpenDota вернул неожиданный формат данных.')
    if (panel === 'items' && (!data || typeof data !== 'object' || Array.isArray(data))) throw new Error('OpenDota вернул неожиданный формат покупок.')
    if (panel === 'benchmarks' && (!data?.result || typeof data.result !== 'object')) throw new Error('OpenDota не вернул показатели героя.')
    const items = constants.status === 'fulfilled' && constants.value && typeof constants.value === 'object' ? constants.value : {}
    return {
        data,
        items,
        warnings: constants.status === 'rejected' ? ['Справочник предметов временно недоступен: показаны их коды.'] : [],
        loadedAt: new Date().toISOString(),
    }
}

export function normalizeItemWins(payload) {
    const rows = payload?.rows || []
    const first = rows[0]
    return {
        sampleGames: finiteNumber(first?.sample_games),
        sampleWins: finiteNumber(first?.sample_wins),
        firstMatch: finiteNumber(first?.first_match),
        lastMatch: finiteNumber(first?.last_match),
        rows: rows.filter((row) => row.item).map((row) => ({
            ...row,
            games: finiteNumber(row.games),
            wins: finiteNumber(row.wins),
            winRate: winPercent(row.wins, row.games),
            avgFirstPurchase: finiteNumber(row.avg_first_purchase),
            frequency: winPercent(row.games, row.sample_games),
        })),
    }
}
