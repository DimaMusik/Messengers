import { useEffect, useMemo, useRef, useState } from 'react'
import { finiteNumber, heroWon, ITEM_PERIODS, ITEM_STAGES, itemCategory, loadHeroPanel, normalizeItemWins, winPercent } from '../lib/heroDetailsApi'
import '../hero-details.css'

const IMAGE_ROOT = 'https://cdn.cloudflare.steamstatic.com'
const tabs = [
    ['itemWins', 'Покупки и победы'], ['items', 'По стадиям'], ['matchups', 'Против кого'],
    ['durations', 'Длительность'], ['benchmarks', 'Показатели'], ['matches', 'Матчи'],
]
const formatNumber = (value, digits = 0) => finiteNumber(value) === null ? '—' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: digits })
const formatPercent = (value) => finiteNumber(value) === null ? '—' : `${formatNumber(value, 1)}%`
const formatDate = (value) => finiteNumber(value) === null ? '—' : new Date(Number(value) * 1000).toLocaleDateString('ru-RU')
const imageUrl = (path) => path?.startsWith('/') ? `${IMAGE_ROOT}${path}` : undefined
const categoryNames = { all: 'Все категории', upgrade: 'Сборные предметы', component: 'Компоненты и базовые', consumable: 'Расходники' }

function formatTime(value) {
    const seconds = finiteNumber(value)
    if (seconds === null) return '—'
    const absolute = Math.abs(Math.round(seconds))
    return `${seconds < 0 ? '−' : ''}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')}`
}

function SafeImage({ src, className }) {
    const [broken, setBroken] = useState(false)
    useEffect(() => setBroken(false), [src])
    return src && !broken
        ? <img className={className} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        : <span className={`${className || ''} hd-image-fallback`} aria-hidden="true">◆</span>
}

function Meter({ value }) {
    return <div className="hd-meter-value"><span>{formatPercent(value)}</span>{value !== null && <span className="hd-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>}</div>
}

function Empty({ children = 'В этой выборке нет данных.' }) {
    return <p className="hd-empty">{children}</p>
}

function DetailTable({ label, headings, children }) {
    return <div className="hd-table-wrap" tabIndex={0} role="region" aria-label={label}>
        <table className="hd-table"><caption className="hd-visually-hidden">{label}</caption>
            <thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>{children}</tbody>
        </table>
    </div>
}

function ItemName({ item, fallback }) {
    return <span className="hd-item-name"><SafeImage className="hd-item-image" src={imageUrl(item?.img)} /><span><strong>{item?.dname || fallback}</strong>{finiteNumber(item?.cost) !== null && <small>{formatNumber(item.cost)} золота</small>}</span></span>
}

function ItemFilters({ query, setQuery, category, setCategory, minimum, setMinimum, sort, setSort, wins = false }) {
    return <div className="hd-filters">
        <label><span>Предмет</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или код…" /></label>
        <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Минимум {wins ? 'матчей' : 'покупок'}</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="0">Без ограничения</option>{[5, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}+</option>)}</select></label>
        <label><span>Сортировать</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="games">По популярности</option>{wins && <option value="winRate">По проценту побед</option>}{wins && <option value="time">По времени покупки</option>}<option value="cost">По стоимости</option><option value="name">По названию</option></select></label>
    </div>
}

function filterItems(rows, constants, { query, category, minimum, sort }) {
    const needle = query.trim().toLowerCase()
    return rows.map((row) => ({ ...row, itemData: constants[row.item] })).filter((row) => {
        const name = `${row.itemData?.dname || ''} ${row.item}`.toLowerCase()
        return name.includes(needle) && (category === 'all' || (row.itemData && itemCategory(row.itemData) === category)) && row.games >= minimum
    }).sort((a, b) => {
        if (sort === 'name') return (a.itemData?.dname || a.item).localeCompare(b.itemData?.dname || b.item)
        if (sort === 'cost') return (finiteNumber(b.itemData?.cost) ?? -Infinity) - (finiteNumber(a.itemData?.cost) ?? -Infinity)
        if (sort === 'winRate') return (b.winRate ?? -Infinity) - (a.winRate ?? -Infinity) || b.games - a.games
        if (sort === 'time') return (a.avgFirstPurchase ?? Infinity) - (b.avgFirstPurchase ?? Infinity)
        return b.games - a.games
    })
}

function useItemFilters() {
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState('all')
    const [minimum, setMinimum] = useState(0)
    const [sort, setSort] = useState('games')
    return { query, setQuery, category, setCategory, minimum, setMinimum, sort, setSort }
}

function ItemWins({ payload, period }) {
    const filters = useItemFilters()
    const summary = normalizeItemWins(payload.data)
    const rows = filterItems(summary.rows, payload.items, filters)
    return <>
        <div className="hd-stats">
            <div><span>Разобранных про-матчей</span><strong>{formatNumber(summary.sampleGames)}</strong></div>
            <div><span>Победы героя в выборке</span><strong>{formatPercent(winPercent(summary.sampleWins, summary.sampleGames))}</strong></div>
            <div><span>Даты найденных матчей</span><strong className="hd-date-range">{summary.sampleGames > 0 ? `${formatDate(summary.firstMatch)} — ${formatDate(summary.lastMatch)}` : '—'}</strong></div>
        </div>
        <p className="hd-note">{period === 'all' ? 'Вся доступная история' : `Последние ${period} дней`}, до 500 последних про-матчей с журналом покупок. Каждый предмет считается один раз на матч. Частота — доля матчей с покупкой; победы — результат этих матчей. Среднее время — первая покупка, включая покупки до выхода крипов.</p>
        <ItemFilters {...filters} wins />
        <p className="hd-count">Предметов: {rows.length} / {summary.rows.length}</p>
        {rows.length ? <DetailTable label="Покупки и процент побед в про-матчах" headings={['Предмет', 'Матчей с покупкой', 'Частота', 'Побед', 'Победы, %', 'Первая покупка']}>
            {rows.map((row) => <tr key={row.item}><td><ItemName item={row.itemData} fallback={row.item} /></td><td>{formatNumber(row.games)}{row.games < 10 && <small className="hd-low-sample">Малая выборка</small>}</td><td>{formatPercent(row.frequency)}</td><td>{formatNumber(row.wins)}</td><td><Meter value={row.winRate} /></td><td>{formatTime(row.avgFirstPurchase)}</td></tr>)}
        </DetailTable> : <Empty>{summary.sampleGames === 0 ? 'За этот период нет разобранных про-матчей с покупками. Выберите более длинный период.' : 'Предметы не найдены. Измените поиск или фильтры.'}</Empty>}
        <p className="hd-note">Высокий винрейт предмета сам по себе не означает, что он сильнее: дорогие вещи чаще покупают уже выигрывающие команды. Для сравнения учитывайте число матчей и время покупки.</p>
    </>
}

function ItemPopularity({ payload }) {
    const [stage, setStage] = useState('early_game_items')
    const filters = useItemFilters()
    const itemById = useMemo(() => Object.fromEntries(Object.entries(payload.items).map(([key, item]) => [item.id, key])), [payload.items])
    const stageInfo = ITEM_STAGES.find((entry) => entry.key === stage)
    const rawRows = Object.entries(payload.data[stage] || {}).map(([id, count]) => ({ item: itemById[id] || `Предмет #${id}`, games: finiteNumber(count) }))
    const rows = filterItems(rawRows, payload.items, filters)
    return <>
        <p className="hd-note">Покупки из последних 100 разобранных про-матчей OpenDota. Повторные покупки считаются отдельно. Стадии включают только предметы с указанной стоимостью; это не полная сборка. Процент побед с предметом — во вкладке «Покупки и победы».</p>
        <div className="hd-segments" aria-label="Стадия игры">{ITEM_STAGES.map((entry) => <button type="button" key={entry.key} aria-pressed={stage === entry.key} onClick={() => setStage(entry.key)}>{entry.label}</button>)}</div>
        <p className="hd-note">{stageInfo.note}</p>
        <ItemFilters {...filters} />
        {rows.length ? <DetailTable label={`Покупки: ${stageInfo.label}`} headings={['Предмет', 'Количество покупок', 'Категория']}>
            {rows.map((row) => <tr key={row.item}><td><ItemName item={row.itemData} fallback={row.item} /></td><td>{formatNumber(row.games)}</td><td>{row.itemData ? categoryNames[itemCategory(row.itemData)] : '—'}</td></tr>)}
        </DetailTable> : <Empty>Нет покупок для выбранной стадии и фильтров.</Empty>}
    </>
}

function Matchups({ payload, heroes, hero }) {
    const [query, setQuery] = useState('')
    const [minimum, setMinimum] = useState(0)
    const [sort, setSort] = useState('games')
    const heroById = useMemo(() => Object.fromEntries(heroes.map((entry) => [entry.id, entry])), [heroes])
    const rows = payload.data.map((row) => ({ ...row, opponent: heroById[row.hero_id], winRate: winPercent(row.wins, row.games_played) }))
        .filter((row) => (row.opponent?.localized_name || String(row.hero_id)).toLowerCase().includes(query.trim().toLowerCase()) && Number(row.games_played) >= minimum)
        .sort((a, b) => sort === 'wins' ? (b.winRate ?? -Infinity) - (a.winRate ?? -Infinity) : sort === 'losses' ? (a.winRate ?? Infinity) - (b.winRate ?? Infinity) : Number(b.games_played) - Number(a.games_played))
    return <>
        <p className="hd-note">Про-матчи за последний год. Процент побед {hero.localized_name} против каждого героя. Это результат противостояний, без поправки на общий винрейт героев. Ранг и период общей таблицы сюда не применяются.</p>
        <div className="hd-filters hd-filters-three"><label><span>Противник</span><input value={query} type="search" placeholder="Найти героя…" onChange={(event) => setQuery(event.target.value)} /></label><label><span>Минимум матчей</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="0">Все</option>{[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}+</option>)}</select></label><label><span>Сортировать</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="games">Частые противники</option><option value="wins">Больше побед</option><option value="losses">Меньше побед</option></select></label></div>
        {rows.length ? <DetailTable label="Результаты против других героев" headings={['Противник', 'Матчей', 'Побед', 'Победы, %']}>
            {rows.map((row) => <tr key={row.hero_id}><td><span className="hd-item-name"><SafeImage className="hd-hero-icon" src={imageUrl(row.opponent?.icon)} /><strong>{row.opponent?.localized_name || `Герой #${row.hero_id}`}</strong></span></td><td>{formatNumber(row.games_played)}</td><td>{formatNumber(row.wins)}</td><td><Meter value={row.winRate} /></td></tr>)}
        </DetailTable> : <Empty />}
    </>
}

function Durations({ payload }) {
    const [minimum, setMinimum] = useState(0)
    const rows = payload.data.filter((row) => finiteNumber(row.duration_bin) !== null && Number(row.games_played) >= minimum).sort((a, b) => Number(a.duration_bin) - Number(b.duration_bin))
    return <>
        <p className="hd-note">Вся доступная история про-матчей OpenDota, интервалы по 5 минут. Показывает, как связаны длительность игры и результат героя. Ранг и период общей таблицы сюда не применяются.</p>
        <div className="hd-filters hd-filters-single"><label><span>Минимум матчей в интервале</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="0">Все интервалы</option>{[10, 25, 100].map((value) => <option key={value} value={value}>{value}+</option>)}</select></label></div>
        {rows.length ? <DetailTable label="Процент побед по длительности матча" headings={['Длительность', 'Матчей', 'Побед', 'Победы, %']}>
            {rows.map((row) => <tr key={row.duration_bin}><td>{formatNumber(Number(row.duration_bin) / 60)}–{formatNumber((Number(row.duration_bin) + 300) / 60)} мин</td><td>{formatNumber(row.games_played)}</td><td>{formatNumber(row.wins)}</td><td><Meter value={winPercent(row.wins, row.games_played)} /></td></tr>)}
        </DetailTable> : <Empty />}
    </>
}

const benchmarkNames = {
    gold_per_min: 'Золото / мин (GPM)', xp_per_min: 'Опыт / мин (XPM)', kills_per_min: 'Убийства / мин', deaths_per_min: 'Смерти / мин', assists_per_min: 'Помощь / мин',
    last_hits_per_min: 'Добивания / мин', denies_per_min: 'Денаи / мин', hero_damage_per_min: 'Урон героям / мин', hero_healing_per_min: 'Лечение / мин', tower_damage: 'Урон строениям', tower_damage_per_min: 'Урон строениям / мин',
    stuns_per_min: 'Оглушения, сек / мин', lhten: 'Добивания на 10-й минуте', lane_efficiency_pct: 'Эффективность линии, %', actions_per_min: 'Действия / мин',
}

function Benchmarks({ payload }) {
    const rows = Object.entries(payload.data.result).filter(([, values]) => Array.isArray(values) && values.length)
    return <>
        <p className="hd-note">Распределение показателей героя из OpenDota. P50 — медиана; P90 — значение, ниже которого 90% наблюдений. Высокое значение не всегда лучше: например, у смертей. API не сообщает здесь размер выборки, ранг и точный период.</p>
        {rows.length ? <DetailTable label="Перцентили показателей героя" headings={['Показатель', 'P50 · медиана', 'P90', 'P99']}>
            {rows.map(([metric, values]) => <tr key={metric}><td>{benchmarkNames[metric] || metric}</td>{[0.5, 0.9, 0.99].map((percentile) => <td key={percentile}>{formatNumber(values.find((entry) => Number(entry.percentile) === percentile)?.value, 2)}</td>)}</tr>)}
        </DetailTable> : <Empty />}
    </>
}

function RecentMatches({ payload }) {
    const [result, setResult] = useState('all')
    const [query, setQuery] = useState('')
    const rows = payload.data.filter((match) => (result === 'all' || heroWon(match) === (result === 'wins')) && (match.league_name || '').toLowerCase().includes(query.trim().toLowerCase()))
    return <>
        <p className="hd-note">До 100 последних про-матчей с героем, которые есть в OpenDota. Ссылка открывает подробный матч с инвентарём, участниками и разбором.</p>
        <div className="hd-filters hd-filters-two"><label><span>Турнир</span><input type="search" value={query} placeholder="Название турнира…" onChange={(event) => setQuery(event.target.value)} /></label><label><span>Результат героя</span><select value={result} onChange={(event) => setResult(event.target.value)}><option value="all">Все матчи</option><option value="wins">Победы</option><option value="losses">Поражения</option></select></label></div>
        {rows.length ? <DetailTable label="Последние профессиональные матчи героя" headings={['Матч / дата', 'Турнир', 'Результат', 'K / D / A', 'Длительность']}>
            {rows.map((match) => {
                const won = heroWon(match)
                return <tr key={`${match.match_id}-${match.player_slot}`}><td><a href={`https://www.opendota.com/matches/${match.match_id}`} target="_blank" rel="noreferrer">#{match.match_id} ↗</a><small className="hd-cell-sub">{formatDate(match.start_time)}</small></td><td className="hd-league">{match.league_name || '—'}</td><td><span className={won === null ? '' : won ? 'hd-win' : 'hd-loss'}>{won === null ? '—' : won ? 'Победа' : 'Поражение'}</span></td><td>{formatNumber(match.kills)} / {formatNumber(match.deaths)} / {formatNumber(match.assists)}</td><td>{formatTime(match.duration)}</td></tr>
            })}
        </DetailTable> : <Empty />}
    </>
}

function HeroDetailsContent({ hero, heroes, onClose }) {
    const [tab, setTab] = useState('itemWins')
    const [period, setPeriod] = useState(90)
    const [retry, setRetry] = useState(0)
    const [state, setState] = useState({ key: '', loading: true, payload: null, error: '' })
    const titleRef = useRef(null)
    const activePeriod = tab === 'itemWins' ? period : 90
    const requestKey = `${hero.id}:${tab}:${activePeriod}:${retry}`

    useEffect(() => { titleRef.current?.focus({ preventScroll: true }) }, [hero.id])
    useEffect(() => {
        const controller = new AbortController()
        let active = true
        setState({ key: requestKey, loading: true, payload: null, error: '' })
        loadHeroPanel(hero.id, tab, { signal: controller.signal, period: activePeriod })
            .then((payload) => { if (active) setState({ key: requestKey, loading: false, payload, error: '' }) })
            .catch((error) => { if (active && error.name !== 'AbortError') setState({ key: requestKey, loading: false, payload: null, error: error.message }) })
        return () => { active = false; controller.abort() }
    }, [hero.id, tab, activePeriod, requestKey])

    const loading = state.key !== requestKey || state.loading
    const payload = !loading ? state.payload : null
    const label = tabs.find(([key]) => key === tab)?.[1]

    function tabKeyDown(event, index) {
        let next = null
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = tabs.length - 1
        if (next !== null) {
            event.preventDefault()
            setTab(tabs[next][0])
            document.getElementById(`hd-tab-${hero.id}-${tabs[next][0]}`)?.focus()
        }
    }

    return <section className="hd-panel" aria-labelledby={`hd-title-${hero.id}`}>
        <header className="hd-header">
            <div className="hd-heading"><SafeImage className="hd-portrait" src={imageUrl(hero.img)} /><div><span className="hd-eyebrow">Анализ героя</span><h2 ref={titleRef} tabIndex={-1} id={`hd-title-${hero.id}`}>{hero.localized_name}</h2><p>{hero.attack_type === 'Melee' ? 'Ближний бой' : hero.attack_type === 'Ranged' ? 'Дальний бой' : ''} · {(hero.roles || []).join(' · ')}</p></div></div>
            <button className="hd-close" type="button" onClick={onClose} aria-label={`Закрыть анализ ${hero.localized_name}`}>Закрыть ×</button>
        </header>
        <p className="hd-scope">У вкладок свои выборки OpenDota. Фильтры ранга, патча и периода в общей таблице не меняют этот анализ. Период покупок выбирается ниже.</p>
        <div className="hd-tabs" role="tablist" aria-label={`Анализ ${hero.localized_name}`}>{tabs.map(([key, name], index) => <button key={key} type="button" role="tab" id={`hd-tab-${hero.id}-${key}`} aria-controls={`hd-content-${hero.id}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={(event) => tabKeyDown(event, index)} onClick={() => setTab(key)}>{name}</button>)}</div>
        <div className="hd-content" role="tabpanel" id={`hd-content-${hero.id}`} aria-labelledby={`hd-tab-${hero.id}-${tab}`} aria-busy={loading} tabIndex={0}>
            <div className="hd-panel-toolbar"><h3>{label}</h3>{tab === 'itemWins' && <label className="hd-period"><span>Период про-матчей</span><select value={period} onChange={(event) => setPeriod(event.target.value === 'all' ? 'all' : Number(event.target.value))}>{ITEM_PERIODS.map((value) => <option key={value} value={value}>{value === 'all' ? 'Вся история · до 500 матчей' : `${value} дней`}</option>)}</select></label>}</div>
            {loading && <p className="hd-status" role="status">Загружаем {tab === 'itemWins' ? 'покупки и результаты матчей' : label.toLowerCase()}…{tab === 'itemWins' && <small>Расчёт OpenDota может занять несколько секунд.</small>}</p>}
            {!loading && state.error && <div className="hd-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</button></div>}
            {payload?.warnings.map((warning) => <p key={warning} className="hd-warning">{warning}</p>)}
            {payload && <div key={`${hero.id}-${tab}-${activePeriod}`}>
                {tab === 'itemWins' && <ItemWins payload={payload} period={period} />}
                {tab === 'items' && <ItemPopularity payload={payload} />}
                {tab === 'matchups' && <Matchups payload={payload} hero={hero} heroes={heroes} />}
                {tab === 'durations' && <Durations payload={payload} />}
                {tab === 'benchmarks' && <Benchmarks payload={payload} />}
                {tab === 'matches' && <RecentMatches payload={payload} />}
            </div>}
        </div>
        <footer className="hd-footer"><a href={`https://www.opendota.com/heroes/${hero.id}`} target="_blank" rel="noreferrer">Источник: OpenDota ↗</a><span>Запросы кешируются на 10 минут</span></footer>
    </section>
}

export default function HeroDetails({ hero, heroes = [], onClose }) {
    return hero ? <HeroDetailsContent key={hero.id} hero={hero} heroes={heroes} onClose={onClose} /> : null
}
