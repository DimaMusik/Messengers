import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_HISTORY_FILTERS, HISTORY_LIMIT, HISTORY_LOBBIES, HISTORY_MODES, HISTORY_RANKS, fetchHistory, fetchHistoryPatches, historyBounds, normalizeHistoryFilters } from '../lib/historicalStats'
import '../historical-stats.css'

const formatNumber = (value) => value.toLocaleString('ru-RU')
const formatPercent = (value) => value == null ? '—' : `${value.toFixed(2)}%`
const formatTime = (value) => value == null ? '—' : `${new Date(value * 1000).toLocaleString('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC`

export default function HistoricalStats({ heroes = [], onSelectHero }) {
  const [draft, setDraft] = useState(DEFAULT_HISTORY_FILTERS)
  const [patches, setPatches] = useState([])
  const [patchError, setPatchError] = useState('')
  const [patchAttempt, setPatchAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [applied, setApplied] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('picks')
  const request = useRef(null)
  const bounds = historyBounds()

  useEffect(() => {
    const controller = new AbortController()
    setPatchError('')
    fetchHistoryPatches(controller.signal).then(setPatches).catch((cause) => {
      if (cause.name !== 'AbortError') setPatchError(cause.message)
    })
    return () => controller.abort()
  }, [patchAttempt])

  useEffect(() => () => request.current?.abort(), [])

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    let filters
    try {
      filters = normalizeHistoryFilters(draft, patches)
    } catch (cause) {
      setError(cause.message)
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 45000)
    setError('')
    setLoading(true)
    const submitted = { ...draft }
    try {
      const data = await fetchHistory(filters, controller.signal)
      if (!controller.signal.aborted) {
        setResult(data)
        setApplied({ filters, draft: submitted })
      }
    } catch (cause) {
      if (!controller.signal.aborted || timedOut) setError(timedOut ? 'OpenDota не ответил за 45 секунд. Уменьшите период и повторите.' : cause.message)
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }

  const visibleRows = useMemo(() => {
    const names = new Map(heroes.map((hero) => [hero.id, hero]))
    return (result?.rows ?? []).map((row) => ({ ...row, hero: names.get(row.id), name: names.get(row.id)?.localized_name ?? `Герой #${row.id}` }))
      .filter((row) => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort] || b.picks - a.picks || a.name.localeCompare(b.name))
  }, [result, heroes, query, sort])
  const pending = applied && JSON.stringify(applied.draft) !== JSON.stringify(draft)

  return <section className="hs-panel" aria-label="История по периодам и патчам">
    <header className="hs-header">
      <div><span className="hs-kicker">Историческая выборка</span><h2>Периоды и патчи</h2></div>
      <span className="hs-badge">OpenDota Explorer</span>
    </header>
    <p className="hs-note">Выберите даты матчей, основной патч, ранг и режим. Здесь используется историческая выборка OpenDota: до {formatNumber(HISTORY_LIMIT)} последних подходящих матчей 5×5 длительностью более 6 минут. Её объём и проценты отличаются от общей таблицы и Dotabuff.</p>
    <form className="hs-form" onSubmit={submit}>
      <label><span>Период</span><select value={draft.period} onChange={(event) => update('period', event.target.value)}>
        <option value="7">Последние 7 дней</option><option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option><option value="dates">Свои даты</option><option value="patch">Основной патч</option>
      </select></label>
      {draft.period === 'patch' && <label><span>Патч OpenDota</span><select value={draft.patch} onChange={(event) => update('patch', event.target.value)}>
        <option value="">Выберите патч</option>{patches.map((patch) => <option key={patch.name} value={patch.name}>{patch.name}{patch.start < bounds.minimum ? ' (частично)' : ''}</option>)}
      </select></label>}
      {draft.period === 'dates' && <>
        <label><span>С даты (UTC)</span><input type="date" required min={bounds.minDate} max={bounds.maxDate} value={draft.from} onChange={(event) => update('from', event.target.value)} /></label>
        <label><span>По дату включительно (UTC)</span><input type="date" required min={draft.from || bounds.minDate} max={bounds.maxDate} value={draft.to} onChange={(event) => update('to', event.target.value)} /></label>
      </>}
      <label><span>Средний ранг матча</span><select value={draft.rank} onChange={(event) => update('rank', event.target.value)}><option value="all">Все, включая неизвестный</option>{HISTORY_RANKS.map((name, index) => <option key={name} value={String(index + 1)}>{name}</option>)}</select></label>
      <label><span>Тип матчей</span><select value={draft.lobby} onChange={(event) => update('lobby', event.target.value)}>{Object.entries(HISTORY_LOBBIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label><span>Режим игры</span><select value={draft.mode} onChange={(event) => update('mode', event.target.value)}>{Object.entries(HISTORY_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button className="hs-submit" type="submit" disabled={loading}>{loading ? 'Запрашиваем…' : 'Показать'}</button>
    </form>
    {draft.period === 'patch' && <p className="hs-note">Список содержит основные патчи из OpenDota; буквенные обновления отдельно не выделены. Доступна история за последние 12 месяцев, поэтому ранний патч может быть представлен частично.</p>}
    {patchError && <p className="hs-note">{patchError} <button type="button" className="hs-link" onClick={() => setPatchAttempt((attempt) => attempt + 1)}>Повторить загрузку патчей</button></p>}
    {pending && <p className="hs-pending">Фильтры изменены. Нажмите «Показать», чтобы применить их. Ниже пока предыдущая выборка.</p>}
    {loading && <p className="hs-status" role="status">OpenDota рассчитывает выборку. Это может занять до 45 секунд.</p>}
    {error && <p className="hs-error" role="alert">{error}{result ? ' Ниже сохранён предыдущий результат.' : ' Измените фильтры или нажмите «Показать» ещё раз.'}</p>}
    {!result && !loading && !error && <div className="hs-empty">Настройте фильтры и нажмите «Показать», чтобы загрузить статистику за выбранный период.</div>}
    {result && applied && <div className="hs-result" aria-busy={loading}>
      <div className="hs-applied"><strong>Показанная выборка</strong><p>{applied.filters.label} · {HISTORY_LOBBIES[applied.filters.lobby]} · {HISTORY_MODES[applied.filters.mode]} · {applied.filters.rank === 'all' ? 'Все ранги' : HISTORY_RANKS[Number(applied.filters.rank) - 1]}</p><p>Запрошены даты: {formatTime(applied.filters.start)} — {formatTime(applied.filters.end)} (конец не включён).</p></div>
      {applied.filters.clipped && <p className="hs-pending">Начало патча выходит за доступную историю. Показана только часть за последние 12 месяцев.</p>}
      {result.capped && <p className="hs-pending">Достигнут предел {formatNumber(HISTORY_LIMIT)} матчей. Это последние подходящие матчи внутри периода; статистика не охватывает весь выбранный интервал. Уменьшите диапазон, чтобы изучить более ранние даты.</p>}
      <div className="hs-summary"><div><span>Матчей в выборке</span><strong>{formatNumber(result.matches)}</strong></div><div><span>Героев с матчами</span><strong>{result.rows.length}</strong></div><div className="hs-dates"><span>Фактические даты матчей</span><strong>{formatTime(result.first)}<br />{formatTime(result.last)}</strong></div></div>
      {result.matches === 0 ? <div className="hs-empty">В этой выборке нет матчей. Попробуйте другой период, ранг или режим. Отсутствие записей в OpenDota не означает, что таких игр не было.</div> : <>
        <div className="hs-table-controls"><label><span>Поиск в результате</span><input type="search" value={query} placeholder="Имя героя" onChange={(event) => setQuery(event.target.value)} /></label><label><span>Сортировка</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="picks">Матчи</option><option value="winRate">Винрейт</option><option value="name">Имя</option></select></label><span>{visibleRows.length} героев</span></div>
        <div className="hs-table-wrap"><table><thead><tr><th>Герой</th><th>Матчи</th><th>Доля пиков</th><th>Победы</th><th>Винрейт</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}>
          <td><button type="button" className="hs-hero" disabled={!row.hero || !onSelectHero} onClick={() => onSelectHero?.(row.id)}>{row.hero?.icon && <img src={`https://cdn.cloudflare.steamstatic.com${row.hero.icon}`} alt="" loading="lazy" />}<span>{row.name}</span></button></td>
          <td>{formatNumber(row.picks)}</td><td>{formatPercent(row.pickRate)}</td><td>{formatNumber(row.wins)}</td><td><span className={row.winRate >= 50 ? 'hs-positive' : ''}>{formatPercent(row.winRate)}</span></td>
        </tr>)}</tbody></table>{visibleRows.length === 0 && <p className="hs-empty">Герои с таким именем не найдены.</p>}</div>
        <p className="hs-note">Доля пиков = матчи героя / все матчи этой выборки. Поиск не меняет знаменатель. Ранг — средний известный ранг участников; неизвестный ранг входит только в «Все». Маленькая выборка даёт нестабильный винрейт.</p>
      </>}
    </div>}
    <p className="hs-source">Источник: <a href="https://www.opendota.com/explorer" target="_blank" rel="noreferrer">OpenDota Explorer</a> · <a href="https://github.com/odota/core/blob/master/svc/cleanup.ts" target="_blank" rel="noreferrer">доступная история</a></p>
  </section>
}
