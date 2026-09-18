import { useState } from 'react'

export default function App() {
    const [menuOpen, setMenuOpen] = useState(false)

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
                    <a href="#heroes" onClick={() => setMenuOpen(false)}>Герои</a>
                    <a href="#matches" onClick={() => setMenuOpen(false)}>Матчи</a>
                    <a href="#items" onClick={() => setMenuOpen(false)}>Предметы</a>
                    <a href="#settings" onClick={() => setMenuOpen(false)}>Настройки</a>
                </nav>
            </aside>

            <section className="card">
                <h1>Dota Hub</h1>
                <p>Тестовая основа приложения про Dota</p>
            </section>
        </main>
    )
}
