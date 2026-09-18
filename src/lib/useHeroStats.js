import { useCallback, useEffect, useRef, useState } from 'react'

export const HERO_STATS_URL = 'https://api.opendota.com/api/heroStats'
let cache = null
const CACHE_TIME = 5 * 60 * 1000

export default function useHeroStats() {
  const [state, setState] = useState({ heroes: cache?.heroes ?? [], loadedAt: cache?.loadedAt ?? null, loading: !cache, error: '' })
  const [revision, setRevision] = useState(0)
  const forceRefresh = useRef(false)
  const refresh = useCallback(() => { forceRefresh.current = true; setRevision((value) => value + 1) }, [])

  useEffect(() => {
    if (!forceRefresh.current && cache && Date.now() - cache.loadedAt < CACHE_TIME) {
      setState({ ...cache, loading: false, error: '' })
      return
    }
    forceRefresh.current = false
    const controller = new AbortController()
    let current = true
    const timeout = setTimeout(() => controller.abort(), 20000)
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    async function load() {
      try {
        const response = await fetch(HERO_STATS_URL, { signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 429 ? 'Лимит запросов OpenDota. Попробуйте через минуту.' : `OpenDota ответил HTTP ${response.status}.`)
        const heroes = await response.json()
        if (!Array.isArray(heroes) || !heroes.length || heroes.some((hero) => !Number.isInteger(hero.id) || !hero.localized_name || !Array.isArray(hero.roles))) {
          throw new Error('OpenDota вернул неожиданный формат данных.')
        }
        if (!current) return
        cache = { heroes, loadedAt: Date.now() }
        setState({ ...cache, loading: false, error: '' })
      } catch (error) {
        if (current) setState((previous) => ({ ...previous, loading: false, error: error.name === 'AbortError' ? 'OpenDota не ответил за 20 секунд.' : error.message || 'Не удалось связаться с OpenDota.' }))
      } finally {
        clearTimeout(timeout)
      }
    }
    load()
    return () => { current = false; clearTimeout(timeout); controller.abort() }
  }, [revision])

  return { ...state, refresh }
}
