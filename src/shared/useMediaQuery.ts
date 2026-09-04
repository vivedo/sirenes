import { useEffect, useState } from 'react'

export const MOBILE_QUERY = '(max-width: 720px)'

export function matchesMedia(query: string): boolean {
  return typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesMedia(query))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** Phone-sized viewport: single pane, compact toolbar, bottom navigation. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
