import type { Track } from './types'

export interface Engagement {
  reset: () => void
  emitLeave: (reason: string) => void
}

interface State {
  pageStart: number
  visibleStart: number
  totalVisibleMs: number
  maxScrollPct: number
  activeMs: number
  lastActivity: number
}

function fresh(): State {
  return {
    pageStart: Date.now(),
    visibleStart: document.visibilityState === 'visible' ? Date.now() : 0,
    totalVisibleMs: 0,
    maxScrollPct: 0,
    activeMs: 0,
    lastActivity: Date.now(),
  }
}

export interface EngagementHooks {
  onHidden?: () => void
  onLeave?: () => void
  touchSession: () => void
  flush: (useBeacon?: boolean) => Promise<void>
  persistQueue: () => void
}

export function installEngagement(track: Track, hooks: EngagementHooks): Engagement {
  let state = fresh()
  let scrollScheduled = false
  let activityScheduled = false

  function updateScroll(): void {
    const doc = document.documentElement
    const body = (document.body || {}) as HTMLElement
    const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0
    const height = Math.max(doc.scrollHeight, body.scrollHeight || 0) - window.innerHeight
    if (height <= 0) return
    const pct = Math.min(100, Math.max(0, Math.round((scrollTop / height) * 100)))
    if (pct > state.maxScrollPct) state.maxScrollPct = pct
  }

  function onScroll(): void {
    if (scrollScheduled) return
    scrollScheduled = true
    requestAnimationFrame(() => { scrollScheduled = false; updateScroll() })
  }

  function bumpActivity(): void {
    if (activityScheduled) return
    activityScheduled = true
    setTimeout(() => {
      activityScheduled = false
      const now = Date.now()
      if (now - state.lastActivity < 30000) state.activeMs += now - state.lastActivity
      state.lastActivity = now
    }, 1000)
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible') {
      state.visibleStart = Date.now()
      hooks.touchSession()
    } else if (state.visibleStart) {
      state.totalVisibleMs += Date.now() - state.visibleStart
      state.visibleStart = 0
      hooks.onHidden?.()
      void hooks.flush()
      hooks.persistQueue()
    }
  }

  function emitLeave(reason: string): void {
    if (state.visibleStart) {
      state.totalVisibleMs += Date.now() - state.visibleStart
      state.visibleStart = 0
    }
    track('$page_leave', {
      $reason: reason,
      $time_on_page_ms: Date.now() - state.pageStart,
      $visible_ms: state.totalVisibleMs,
      $active_ms: state.activeMs,
      $max_scroll_pct: state.maxScrollPct,
    })
    hooks.onLeave?.()
    void hooks.flush(true)
    hooks.persistQueue()
  }

  ;['mousemove','keydown','scroll','touchstart','wheel'].forEach(ev => {
    addEventListener(ev, bumpActivity, { passive: true })
  })
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('visibilitychange', onVisibility)

  return {
    reset: () => { state = fresh() },
    emitLeave,
  }
}
