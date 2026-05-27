export interface NavigationHooks {
  onLocationChange: () => void
  onPagehidePersisted: () => void
  onPagehideUnload: () => void
  onPageshowRestored: () => void
}

export function installNavigation(hooks: NavigationHooks): void {
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigatesuccess', () => {
      dispatchEvent(new Event('oak:locationchange'))
    })
  } else {
    const patch = (method: 'pushState' | 'replaceState'): void => {
      const orig = history[method]
      history[method] = function (this: History, ...args: Parameters<typeof orig>) {
        const result = orig.apply(this, args)
        dispatchEvent(new Event('oak:locationchange'))
        return result
      } as typeof orig
    }
    patch('pushState')
    patch('replaceState')
    addEventListener('popstate', () => dispatchEvent(new Event('oak:locationchange')))
  }
  addEventListener('oak:locationchange', hooks.onLocationChange)

  // BFCache-aware: don't emit $page_leave when going into BFCache, and emit a
  // pageview with $bfcache_restore on restoration.
  addEventListener('pagehide', e => {
    if (e.persisted) hooks.onPagehidePersisted()
    else hooks.onPagehideUnload()
  })
  addEventListener('pageshow', e => {
    if (e.persisted) hooks.onPageshowRestored()
  })
}
