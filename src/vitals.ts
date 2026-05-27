import type { Config, Log, Track } from './types'
import { cssSelector } from './autocapture'

export interface Vitals {
  capture: () => void
  emitInpFinal: () => void
  emitClsFinal: () => void
  reset: () => void
}

export function installVitals(config: Config, track: Track, log: Log): Vitals {
  let clsValue = 0
  let clsEntries: PerformanceEntry[] = []
  let clsEmitted = false
  let worstInp = 0
  let worstInpName = ''
  let inpEmitted = false

  function emitClsFinal(): void {
    if (clsEmitted) return
    clsEmitted = true
    if (clsValue > 0) track('$web_vital', { $metric: 'CLS', $value: +clsValue.toFixed(4) })
  }
  function emitInpFinal(): void {
    if (inpEmitted || worstInp <= 0) return
    inpEmitted = true
    track('$web_vital', { $metric: 'INP', $value: Math.round(worstInp), $name: worstInpName })
  }

  function reset(): void {
    clsValue = 0; clsEntries = []; clsEmitted = false
    worstInp = 0; worstInpName = ''; inpEmitted = false
  }

  function capture(): void {
    if (!window.performance?.getEntriesByType) return
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav) {
        track('$performance', {
          $perf_type: nav.type,
          $ttfb: Math.round(nav.responseStart),
          $dom_interactive: Math.round(nav.domInteractive),
          $dom_content_loaded: Math.round(nav.domContentLoadedEventEnd),
          $load: Math.round(nav.loadEventEnd),
          $dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          $tcp: Math.round(nav.connectEnd - nav.connectStart),
          $tls: nav.secureConnectionStart ? Math.round(nav.connectEnd - nav.secureConnectionStart) : 0,
          $request: Math.round(nav.responseStart - nav.requestStart),
          $response: Math.round(nav.responseEnd - nav.responseStart),
          $transfer_size: nav.transferSize,
          $encoded_size: nav.encodedBodySize,
          $decoded_size: nav.decodedBodySize,
        })
      }
      const paints = performance.getEntriesByType('paint')
      for (const p of paints) {
        track('$paint', { $paint_name: p.name, $start_time: Math.round(p.startTime) })
      }
    } catch (e) { log('perf err', e) }

    if (!window.PerformanceObserver) return

    let lastLcp: PerformanceEntry | null = null
    try {
      const lcpObs = new PerformanceObserver(list => {
        const entries = list.getEntries()
        lastLcp = entries[entries.length - 1]
      })
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true })
      const finalizeLcp = () => {
        if (!lastLcp) return
        track('$web_vital', {
          $metric: 'LCP',
          $value: Math.round(lastLcp.startTime),
          $element_tag: lastLcp.element ? lastLcp.element.tagName : null,
          $element_selector: lastLcp.element ? cssSelector(lastLcp.element) : null,
          $element_id: lastLcp.element ? lastLcp.element.id || null : null,
          $url: lastLcp.url || null,
          $size: lastLcp.size || null,
          $render_time: lastLcp.renderTime ? Math.round(lastLcp.renderTime) : null,
          $load_time: lastLcp.loadTime ? Math.round(lastLcp.loadTime) : null,
        })
        lastLcp = null
      }
      addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') finalizeLcp()
      })
    } catch {}

    try {
      let sessionValue = 0
      const clsObs = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue
          const firstEntry = clsEntries[0]
          const lastEntry = clsEntries[clsEntries.length - 1]
          if (lastEntry &&
              entry.startTime - lastEntry.startTime < 1000 &&
              entry.startTime - firstEntry.startTime < 5000) {
            sessionValue += entry.value || 0
            clsEntries.push(entry)
          } else {
            sessionValue = entry.value || 0
            clsEntries = [entry]
          }
          if (sessionValue > clsValue) clsValue = sessionValue
        }
      })
      clsObs.observe({ type: 'layout-shift', buffered: true })
    } catch {}

    try {
      const inpObs = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration > worstInp) {
            worstInp = entry.duration
            worstInpName = entry.name
          }
        }
      })
      inpObs.observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit)
    } catch {}

    if (config.longTasks) {
      try {
        const lto = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            track('$long_task', {
              $duration: Math.round(entry.duration),
              $start_time: Math.round(entry.startTime),
              $attribution_name: entry.attribution?.[0]?.name || null,
              $attribution_type: entry.attribution?.[0]?.containerType || null,
            })
          }
        })
        lto.observe({ type: 'longtask', buffered: true })
      } catch {}
    }
  }

  return { capture, emitInpFinal, emitClsFinal, reset }
}
