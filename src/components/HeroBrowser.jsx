import { useMemo, useState } from 'react'
import HeroDetails from './HeroDetails.jsx'
import HistoricalStats from './HistoricalStats.jsx'
import useHeroStats from '../lib/useHeroStats.js'
import { ATTRIBUTES, ROLES, RANKS, DEFAULT_FILTERS, buildRows, filterRows, sortRows, number, percentage, rate } from '../lib/heroStats.js'

const SAMPLES = { pub: 'Все паблики', ranked: 'Паблики по рангу', turbo: 'Turbo', pro: 'Профессиональные' }
const VIEWS = [['overview', 'Обзор'], ['ranks', 'По рангам'], ['trends', 'Динамика'], ['draft', 'Драфт'], ['attributes', 'Характеристики'], ['history', 'Периоды / патчи']]

function Select({ title, value, onChange, children, disabled = false }) {
  return <label><span>{title}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function SortHeader({ label, field, title, sort, onSort }) {
  const selected = sort.key === field
  return <th scope="col" aria-sort={selected ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} title={title}>
    <button type="button" onClick={() => onSort({ key: field, direction: selected && sort.direction === 'desc' ? 'asc' : 'desc' })}>{label} <span aria-hidden="true">{selected ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button>
  </th>
}

export default function HeroBrowser() {
  const { heroes, loading, error, loadedAt, refresh } = useHeroStats()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [view, setView] = useState('overview')
  const [sort, setSort] = useState({ key: 'picks', direction: 'desc' })
  const [selectedHero, setSelectedHero] = useState(null)
  const rows = useMemo(() => buildRows(heroes, filters), [heroes, filters])
  const visible = useMemo(() => sortRows(filterRows(rows, filters), sort.key, sort.direction), [rows, filters, sort])
  const samplePicks = rows.reduce((sum, hero) => sum + (hero.picks ?? 0), 0)
  const leader = [...visible].filter((hero) => hero.picks >= 100 && hero.winRate !== null).sort((a, b) => b.winRate - a.winRate)[0]
  const rankCounts = RANKS.map(([rank]) => heroes.reduce((sum, hero) => sum + (hero[`${rank}_pick`] ?? 0), 0))
  const allowPeriod = ['pub', 'turbo'].includes(filters.sample)
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(loadedAt || Date.now())
    date.setUTCDate(date.getUTCDate() - 6 + index)
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  })

  function update(key, value) { setFilters((previous) => ({ ...previous, [key]: value })) }
  function selectSample(sample) {
    setFilters((previous) => ({ ...previous, sample, days: ['ranked', 'pro'].includes(sample) ? '7' : previous.days }))
    if ((view === 'ranks' && sample !== 'ranked') || (view === 'draft' && sample !== 'pro') || (view === 'trends' && !['pub', 'turbo'].includes(sample))) {
      setView('overview'); setSort({ key: 'picks', direction: 'desc' })
    }
  }
  function changeView(next) {
    setView(next)
    if (next === 'ranks') setFilters((previous) => ({ ...previous, sample: 'ranked', days: '7' }))
    if (next === 'draft') setFilters((previous) => ({ ...previous, sample: 'pro', days: '7' }))
    if (next === 'trends') setFilters((previous) => ({ ...previous, sample: ['pub', 'turbo'].includes(previous.sample) ? previous.sample : 'pub', days: '7' }))
    setSort({ key: next === 'draft' ? 'bans' : next === 'attributes' ? 'localized_name' : 'picks', direction: next === 'attributes' ? 'asc' : 'desc' })
  }
  function toggleRank(id) { update('ranks', filters.ranks.includes(id) ? filters.ranks.filter((rank) => rank !== id) : [...filters.ranks, id]) }
  function reset() { setFilters(DEFAULT_FILTERS); setSort({ key: 'picks', direction: 'desc' }); setView('overview') }
  function heading(label, field, title) { return <SortHeader label={label} field={field} title={title} sort={sort} onSort={setSort} /> }

  return <section className="heroes-page">
    <header className="heroes-header">
      <div><span className="section-label">Dota Hub / Аналитика</span><h1>Герои</h1><p>Выбери выборку, сравни героев и открой подробный разбор.</p></div>
      <button className="secondary-button" type="button" onClick={refresh} disabled={loading}>{loading ? 'Загружаем…' : 'Обновить данные'}</button>
    </header>
    <div className="data-note">
      <strong>Источник: <a href="https://www.opendota.com/heroes" target="_blank" rel="noreferrer">OpenDota</a></strong>
      <span>У Dotabuff другая выборка матчей, поэтому значения могут отличаться. Здесь используются данные OpenDota.</span>
      {view !== 'history' && <span>Срез за 7 календарных дней UTC, включая неполный текущий день. Дни в динамике — дни сбора данных.</span>}
      {loadedAt && <small>Основная таблица получена {new Date(loadedAt).toLocaleString('ru-RU')}.</small>}
    </div>
    <div className="analysis-tabs" role="group" aria-label="Категория анализа">{VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}>{label}</button>)}</div>

    {view === 'history' ? <HistoricalStats heroes={heroes} onSelectHero={setSelectedHero} /> : <>
      <div className="filter-panel">
        <div className="filters">
          <label className="search-field"><span>Поиск героя</span><input type="search" value={filters.query} placeholder="Например, Invoker" onChange={(event) => update('query', event.target.value)} /></label>
          <Select title="Выборка матчей" value={filters.sample} onChange={selectSample}>{Object.entries(SAMPLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select title="Период сбора (UTC)" value={filters.days} onChange={(value) => update('days', value)} disabled={!allowPeriod || view === 'trends'}><option value="7">Последние 7 дней</option><option value="3">Последние 3 дня</option><option value="1">Сегодня · неполный день</option></Select>
          <Select title="Атрибут" value={filters.attribute} onChange={(value) => update('attribute', value)}><option value="any">Все атрибуты</option>{Object.entries(ATTRIBUTES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select title="Способности героя / роль" value={filters.role} onChange={(value) => update('role', value)}><option value="any">Все роли</option>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select title="Тип атаки" value={filters.attack} onChange={(value) => update('attack', value)}><option value="any">Любой</option><option value="Melee">Ближний бой</option><option value="Ranged">Дальний бой</option></Select>
          <label><span>Минимум матчей героя</span><input type="number" min="0" step="1" value={filters.minPicks} placeholder="0" onChange={(event) => update('minPicks', event.target.value)} /></label>
          <label><span>Винрейт от, %</span><input type="number" min="0" max="100" step="0.1" value={filters.minWin} placeholder="0" onChange={(event) => update('minWin', event.target.value)} /></label>
          <label><span>Винрейт до, %</span><input type="number" min="0" max="100" step="0.1" value={filters.maxWin} placeholder="100" onChange={(event) => update('maxWin', event.target.value)} /></label>
        </div>
        {filters.sample === 'ranked' && <fieldset className="rank-filter"><legend>Средний ранг матча · можно выбрать несколько</legend>
          <div className="rank-options">{RANKS.map(([id, label, english], index) => <button key={id} type="button" aria-pressed={filters.ranks.includes(id)} className={filters.ranks.includes(id) ? 'selected' : ''} onClick={() => toggleRank(id)} title={`${english}: ${number(rankCounts[index])} пиков в выборке`}><span>{label}</span><small>{english}{heroes.length > 0 && rankCounts[index] === 0 ? ' · нет выборки' : ''}</small></button>)}</div>
          <div className="rank-actions"><button type="button" onClick={() => update('ranks', RANKS.map(([id]) => id))}>Все ранги</button><button type="button" onClick={() => update('ranks', ['6', '7', '8'])}>Властелин — Титан</button><button type="button" onClick={() => update('ranks', [])}>Снять выбор</button></div>
          <p className="filter-help">Ранг относится к среднему уровню матча, а не к медали конкретного игрока. Эти группы не означают отдельный режим Ranked.</p>
        </fieldset>}
        <div className="filter-footer"><p className="filter-help">Роль описывает героя, а не сыгранную позицию 1–5. {(!allowPeriod || view === 'trends') && 'Для этой категории доступен срез за 7 дней.'}</p><button className="text-button" type="button" onClick={reset}>Сбросить фильтры</button></div>
      </div>
      {error && <div className="request-error" role="alert"><p>{error} {heroes.length > 0 && 'Показана последняя успешно загруженная выборка.'}</p><button type="button" className="secondary-button" onClick={refresh} disabled={loading}>Повторить</button></div>}
      {loading && !heroes.length && <p className="status" role="status">Загружаем героев и статистику…</p>}
      {heroes.length > 0 && <>
        <div className="stats-summary">
          <div><span>Героев после фильтров</span><strong>{visible.length} <small>/ {heroes.length}</small></strong></div>
          <div><span>Пиков во всей выборке</span><strong>{number(samplePicks)}</strong><small>{SAMPLES[filters.sample]} · {filters.days} дн.</small></div>
          <div><span>Макс. винрейт · минимум 100 матчей</span><strong>{leader ? percentage(leader.winRate) : '—'}</strong><small>{leader?.localized_name || 'Недостаточно данных после фильтров'}</small></div>
        </div>
        <div className="table-caption"><p>Нажми имя героя, чтобы открыть предметы, соперников и подробную статистику.</p><span>Сортировка по заголовку столбца</span></div>
        {view === 'ranks' && <p className="filter-help view-note">В столбцах — винрейт и число пиков выбранных рангов. Без выборки показываем «—».</p>}
        {view === 'trends' && <p className="filter-help view-note">Винрейт по дням сбора UTC. Δ сравнивает последний и первый день; текущий день ещё не завершён.</p>}
        {view === 'attributes' && <p className="filter-help view-note">Справочник OpenDota не указывает патч параметров. Броня и урон — базовые, без бонусов атрибутов; после «+» указан прирост за уровень.</p>}
        {!visible.length ? <div className="empty-results"><h2>Ничего не найдено</h2><p>Попробуй изменить поиск, ранг или минимальное число матчей.</p><button type="button" className="secondary-button" onClick={reset}>Сбросить фильтры</button></div> : <div className="table-wrap" tabIndex="0" role="region" aria-label="Таблица статистики героев">
          <table className="analytics-table"><caption className="sr-only">{VIEWS.find(([id]) => id === view)?.[1]} · {SAMPLES[filters.sample]}</caption><thead><tr>
            {heading('Герой', 'localized_name')}
            {view === 'overview' && <>{heading('Матчи героя', 'picks')}{heading('Винрейт', 'winRate')}{heading('Пикрейт ≈', 'pickRate', 'Пики героя / (все пики выборки / 10), до фильтров поиска, ролей и атрибутов.')}{heading('Победы', 'wins')}{heading('Поражения', 'losses')}<th scope="col" title="95% интервал Уилсона. Мало матчей — широкий интервал.">Интервал 95%</th></>}
            {view === 'ranks' && <>{heading('Выбранные ранги', 'winRate')}{RANKS.filter(([id]) => filters.ranks.includes(id)).map(([id, label]) => <SortHeader key={id} label={label} field={`rank-${id}`} sort={sort} onSort={setSort} />)}</>}
            {view === 'trends' && <>{heading('Матчи героя', 'picks')}{dates.map((date) => <th scope="col" key={date}>{date}</th>)}{heading('Δ, п.п.', 'change')}</>}
            {view === 'draft' && <>{heading('Про-пики', 'picks')}{heading('Про-баны', 'bans')}{heading('Винрейт', 'winRate')}{heading('Победы', 'wins')}{heading('Поражения', 'losses')}</>}
            {view === 'attributes' && <><th scope="col">Атрибут / роли</th>{heading('Баз. STR', 'base_str')}{heading('Баз. AGI', 'base_agi')}{heading('Баз. INT', 'base_int')}{heading('Скорость', 'move_speed')}{heading('Дальность атаки', 'attack_range')}{heading('Баз. броня', 'base_armor')}<th scope="col">Баз. урон</th></>}
          </tr></thead><tbody>{visible.map((hero) => <tr key={hero.id} className={selectedHero === hero.id ? 'selected-row' : ''}>
            <th scope="row"><button type="button" className="hero-link" onClick={() => setSelectedHero(hero.id)}><img loading="lazy" src={`https://cdn.cloudflare.steamstatic.com${hero.icon}`} alt="" width="34" height="34" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /><span>{hero.localized_name}<small>{ATTRIBUTES[hero.primary_attr]} · {hero.attack_type === 'Melee' ? 'Ближний бой' : 'Дальний бой'}</small></span><span aria-hidden="true" className="hero-link-arrow">↗</span></button></th>
            {view === 'overview' && <><td>{number(hero.picks)}</td><td className={hero.winRate >= 50 ? 'stat-positive' : ''}>{percentage(hero.winRate)}</td><td>{percentage(hero.pickRate)}</td><td>{number(hero.wins)}</td><td>{number(hero.losses)}</td><td className="muted">{hero.confidence ? `${number(hero.confidence[0], 1)}–${number(hero.confidence[1], 1)}%` : '—'}</td></>}
            {view === 'ranks' && <><td>{percentage(hero.winRate)}<small className="cell-detail">{number(hero.picks)} пиков</small></td>{RANKS.filter(([id]) => filters.ranks.includes(id)).map(([id]) => <td key={id}>{percentage(rate(hero[`${id}_win`], hero[`${id}_pick`]))}<small className="cell-detail">{number(hero[`${id}_pick`])} пиков</small></td>)}</>}
            {view === 'trends' && <><td>{number(hero.picks)}</td>{dates.map((date, index) => <td key={date} title={`${number(hero.trend[index]?.picks)} пиков`}>{percentage(hero.trend[index]?.winRate)}</td>)}<td className={hero.change > 0 ? 'stat-positive' : hero.change < 0 ? 'stat-negative' : ''}>{hero.change === null ? '—' : `${hero.change > 0 ? '+' : ''}${number(hero.change, 2)}`}</td></>}
            {view === 'draft' && <><td>{number(hero.picks)}</td><td>{number(hero.bans)}</td><td>{percentage(hero.winRate)}</td><td>{number(hero.wins)}</td><td>{number(hero.losses)}</td></>}
            {view === 'attributes' && <><td><span className={`attribute ${hero.primary_attr}`}>{ATTRIBUTES[hero.primary_attr]}</span><small className="cell-detail">{hero.roles.map((role) => ROLES[role] || role).join(', ')}</small></td><td>{number(hero.base_str)} <small>+{number(hero.str_gain, 1)}</small></td><td>{number(hero.base_agi)} <small>+{number(hero.agi_gain, 1)}</small></td><td>{number(hero.base_int)} <small>+{number(hero.int_gain, 1)}</small></td><td>{number(hero.move_speed)}</td><td>{number(hero.attack_range)}</td><td>{number(hero.base_armor, 1)}</td><td>{number(hero.base_attack_min)}–{number(hero.base_attack_max)}</td></>}
          </tr>)}</tbody></table>
        </div>}
        <p className="source">Пикрейт — оценка из 10 героев на матч. Поиск и фильтры героев не меняют её знаменатель. «—» означает отсутствие выборки.</p>
        <details className="methodology"><summary>Как читать данные</summary><p>Все паблики используют общие счётчики API. Группы по рангу могут не покрывать всю эту выборку. Для нескольких рангов сначала суммируются победы и пики, затем рассчитывается общий винрейт.</p><p>Периоды основного среза относятся к дням сбора OpenDota. Для дат начала матчей и патчей открой «Периоды / патчи». Исторические покупки и их винрейт находятся в разборе героя и используют отдельную профессиональную выборку.</p><p>Процент побед с предметом или против героя показывает связь в выборке, а не гарантирует результат следующего матча.</p></details>
      </>}
    </>}
    {selectedHero !== null && heroes.some((hero) => hero.id === selectedHero) && <div className="hero-detail-anchor" key={selectedHero}><HeroDetails hero={heroes.find((hero) => hero.id === selectedHero)} heroes={heroes} onClose={() => setSelectedHero(null)} /></div>}
  </section>
}
