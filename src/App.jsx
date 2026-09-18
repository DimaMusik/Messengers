import { useEffect, useRef, useState } from 'react'
import HeroBrowser from './components/HeroBrowser.jsx'

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [page, setPage] = useState('home')
  const menuButton = useRef(null)
  const drawer = useRef(null)

  function closeMenu() { setMenuOpen(false); menuButton.current?.focus() }
  function navigate(nextPage) { setPage(nextPage); closeMenu() }

  useEffect(() => {
    if (!menuOpen) return
    drawer.current.querySelector('button')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event) {
      if (event.key === 'Escape') closeMenu()
      if (event.key === 'Tab') {
        const buttons = [...drawer.current.querySelectorAll('button')]
        const first = buttons[0]
        const last = buttons.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow }
  }, [menuOpen])

  return <main className={page === 'heroes' ? 'page page-analytics' : 'page'}>
    <button ref={menuButton} className="menu-button" type="button" aria-label="Открыть меню" aria-controls="navigation-drawer" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
    <button className={'overlay ' + (menuOpen ? 'visible' : '')} type="button" aria-label="Закрыть меню" tabIndex={-1} onClick={closeMenu} />
    <aside id="navigation-drawer" ref={drawer} className={'drawer ' + (menuOpen ? 'open' : '')} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? true : undefined} aria-label="Основная навигация" aria-hidden={!menuOpen}>
      <div className="drawer-header"><strong>Dota Hub</strong><button tabIndex={menuOpen ? 0 : -1} type="button" aria-label="Закрыть меню" onClick={closeMenu}>×</button></div>
      <nav>{[['home', 'Главная'], ['heroes', 'Герои']].map(([id, label]) => <button key={id} tabIndex={menuOpen ? 0 : -1} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} type="button" onClick={() => navigate(id)}>{label}</button>)}</nav>
    </aside>
    {page === 'home' ? <section className="card"><h1>Dota Hub</h1><p>Тестовая основа приложения про Dota</p></section> : <HeroBrowser />}
  </main>
}
