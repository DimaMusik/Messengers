import { useEffect, useMemo, useState } from 'react'

const API_URL = 'https://api.opendota.com/api/heroStats'
const IMAGE_ROOT = 'https://cdn.cloudflare.steamstatic.com'

const attributeNames = {
    str: 'Сила',
    agi: 'Ловкость',
    int: 'Интеллект',
    all: 'Универсальный',
}

function percent(wins, matches) {
    return matches ? ((wins / matches) * 100).toFixed(1) : '—'
}

function publicStats(hero, rank) {
    if (rank !== 'all') {
        const picks = hero[`${rank}_pick`] || 0
        const wins = hero[`${rank}_win`] || 0
        return { picks, winRate: percent(wins, picks) }
    }

    let picks = 0
    let wins = 0
    for (let rank = 1; rank <= 8; rank += 1) {
        picks += hero[`${rank}_pick`] || 0
        wins += hero[`${rank}_win`] || 0
    }
    return { picks, winRate: percent(wins, picks) }
}

export default function App() {
    const [menuOpen, setMenuOpen] = useState(false)
    const [page, setPage] = useState('home')
    const [heroes, setHeroes] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [query, setQuery] = useState('')
    const [attribute, setAttribute] = useState('all')
    const [role, setRole] = useState('all')
    const [rank, setRank] = useState('all')
    const [sort, setSort] = useState('picks')

    useEffect(() => {
        if (page !== 'heroes' || heroes.length) return

        const controller = new AbortController()
        setLoading(true)
        setError('')

        fetch(API_URL, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return response.json()
            })
            .then((data) => setHeroes(data))
            .catch((requestError) => {
                if (requestError.name !== 'AbortError') {
                    setError('Не удалось загрузить героев. Попробуйте ещё раз позже.')
                }
            })
            .finally(() => setLoading(false))

        return () => controller.abort()
    }, [page, heroes.length])

    const visibleHeroes = useMemo(() => heroes
        .map((hero) => ({ ...hero, public: publicStats(hero, rank) }))
        .filter((hero) => hero.localized_name.toLowerCase().includes(query.toLowerCase()))
        .filter((hero) => attribute === 'all' || hero.primary_attr === (attribute === 'universal' ? 'all' : attribute))
        .filter((hero) => role === 'all' || hero.roles.includes(role))
        .sort((a, b) => {
            if (sort === 'name') return a.localized_name.localeCompare(b.localized_name)
            if (sort === 'wins') return Number(b.public.winRate) - Number(a.public.winRate)
            if (sort === 'pro') return (b.pro_pick || 0) - (a.pro_pick || 0)
            return b.public.picks - a.public.picks
        }), [heroes, query, attribute, role, rank, sort])

    function navigate(nextPage) {
        setPage(nextPage)
        setMenuOpen(false)
    }

    return (
        <main className="page">
            <button
                className="menu-button"
                type="button"
                aria-label="Открыть меню"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
            >
                <span />
                <span />
                <span />
            </button>

            <button
                className={`overlay ${menuOpen ? 'visible' : ''}`}
                type="button"
                aria-label="Закрыть меню"
                onClick={() => setMenuOpen(false)}
            />

            <aside className={`drawer ${menuOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <strong>Dota Hub</strong>
                    <button type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)}>×</button>
                </div>
                <nav>
                    <button className={page === 'home' ? 'active' : ''} type="button" onClick={() => navigate('home')}>Главная</button>
                    <button className={page === 'heroes' ? 'active' : ''} type="button" onClick={() => navigate('heroes')}>Герои</button>
                </nav>
            </aside>

            {page === 'home' ? (
                <section className="card">
                    <h1>Dota Hub</h1>
                    <p>Тестовая основа приложения про Dota</p>
                </section>
            ) : (
                <section className="heroes-page">
                    <header className="heroes-header">
                        <div>
                            <span className="section-label">OpenDota API</span>
                            <h1>Герои</h1>
                            <p>Общая и профессиональная статистика по всем героям.</p>
                        </div>
                    </header>

                    <div className="filters">
                        <label className="search-field">
                            <span>Поиск</span>
                            <input type="search" placeholder="Найти героя..." value={query} onChange={(event) => setQuery(event.target.value)} />
                        </label>
                        <label>
                            <span>Ранг</span>
                            <select value={rank} onChange={(event) => setRank(event.target.value)}>
                                <option value="all">Все ранги</option>
                                <option value="1">Herald</option><option value="2">Guardian</option>
                                <option value="3">Crusader</option><option value="4">Archon</option>
                                <option value="5">Legend</option><option value="6">Ancient</option>
                                <option value="7">Divine</option><option value="8">Immortal</option>
                            </select>
                        </label>
                        <label>
                            <span>Атрибут</span>
                            <select value={attribute} onChange={(event) => setAttribute(event.target.value)}>
                                <option value="all">Все</option><option value="str">Сила</option>
                                <option value="agi">Ловкость</option><option value="int">Интеллект</option>
                                <option value="universal">Универсальные</option>
                            </select>
                        </label>
                        <label>
                            <span>Роль</span>
                            <select value={role} onChange={(event) => setRole(event.target.value)}>
                                <option value="all">Все роли</option><option value="Carry">Carry</option>
                                <option value="Support">Support</option><option value="Nuker">Nuker</option>
                                <option value="Disabler">Disabler</option><option value="Jungler">Jungler</option>
                                <option value="Durable">Durable</option><option value="Escape">Escape</option>
                                <option value="Pusher">Pusher</option><option value="Initiator">Initiator</option>
                            </select>
                        </label>
                        <label>
                            <span>Сортировка</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                <option value="picks">По матчам</option><option value="wins">По победам</option>
                                <option value="pro">По про-пикам</option><option value="name">По имени</option>
                            </select>
                        </label>
                    </div>

                    {loading && <p className="status">Загружаем героев…</p>}
                    {error && <p className="status error">{error}</p>}

                    {!loading && !error && (
                        <>
                        <p className="results-count">Найдено героев: {visibleHeroes.length}</p>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Герой</th>
                                        <th>Атрибут</th>
                                        <th>Роли</th>
                                        <th>Матчи</th>
                                        <th>Победы</th>
                                        <th>Про-пики</th>
                                        <th>Про-победы</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleHeroes.map((hero) => (
                                        <tr key={hero.id}>
                                            <td>
                                                <div className="hero-name">
                                                    <img src={`${IMAGE_ROOT}${hero.icon}`} alt="" />
                                                    <strong>{hero.localized_name}</strong>
                                                </div>
                                            </td>
                                            <td><span className={`attribute ${hero.primary_attr}`}>{attributeNames[hero.primary_attr]}</span></td>
                                            <td className="roles">{hero.roles.join(', ')}</td>
                                            <td>{hero.public.picks.toLocaleString('ru-RU')}</td>
                                            <td>{hero.public.winRate}{hero.public.winRate !== '—' && '%'}</td>
                                            <td>{(hero.pro_pick || 0).toLocaleString('ru-RU')}</td>
                                            <td>{percent(hero.pro_win, hero.pro_pick)}{hero.pro_pick ? '%' : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}

                    <p className="source">Данные: <a href="https://www.opendota.com/" target="_blank" rel="noreferrer">OpenDota</a></p>
                </section>
            )}
        </main>
    )
}
