import type { BeforeSend, Config, Log, OakEvent, Props, Session, Track } from './types'
import type { AttributionState } from './attribution'
import { referrerInfo } from './attribution'
import { fillUaCh, fingerprint, hardwareInfo, localeInfo, networkInfo, screenInfo, uaParse } from './device'
import { createRateLimiter } from './rate-limit'
import { uuid } from './util'

export interface EventBuilderDeps {
  config: Config
  log: Log
  session: Session
  attribution: AttributionState
  storage: { load: <T = unknown>(k: string) => T | null }
  getDistinctId: () => string
  getAnonId: () => string
  getTraits: () => Props
  getSuperProps: () => Props
  getGroups: () => Record<string, { id: string; traits: Props }>
  touchSession: () => void
  enqueue: (event: OakEvent) => void
}

export function createTrack(deps: EventBuilderDeps): Track {
  const { config, log, session, attribution, getDistinctId, getAnonId, getTraits, getSuperProps, getGroups, touchSession, enqueue } = deps
  let deviceContext: Props | null = null

  const limiter = createRateLimiter(config.rateLimitPerSecond, config.rateLimitBurst, log)
  const beforeSend: BeforeSend[] = Array.isArray(config.beforeSend)
    ? config.beforeSend
    : config.beforeSend
      ? [config.beforeSend]
      : []

  function buildDeviceContext(): Props {
    if (deviceContext) return deviceContext
    const ua = navigator.userAgent
    // Hold a const reference so the closure below doesn't widen the type.
    const ctx: Props = Object.assign(
      { user_agent: ua } as Props,
      uaParse(ua),
      screenInfo(),
      networkInfo(),
      localeInfo(),
      hardwareInfo(),
    )
    deviceContext = ctx
    fillUaCh(ctx)
    const finishFp = () => Object.assign(ctx, fingerprint(config))
    if (typeof requestIdleCallback === 'function') requestIdleCallback(finishFp, { timeout: 2000 })
    else setTimeout(finishFp, 200)
    return ctx
  }

  function shouldSample(name: string): boolean {
    const rate = config.sampleRates[name]
    if (rate === undefined || rate >= 1) return true
    if (rate <= 0) return false
    return Math.random() < rate
  }

  function buildEvent(name: string, properties?: Props): OakEvent {
    touchSession()
    const traits = getTraits()
    const groups = getGroups()
    const ev: OakEvent = {
      id: uuid(),
      event: name,
      timestamp: new Date().toISOString(),
      distinct_id: getDistinctId(),
      anonymous_id: getAnonId(),
      session_id: session.id,
      session_number: session.n,
      session_started_at: new Date(session.start).toISOString(),
      properties: Object.assign(
        {
          $current_url: location.href,
          $pathname: location.pathname,
          $search: location.search,
          $hash: location.hash,
          $title: document.title,
          $host: location.hostname,
          $protocol: location.protocol,
          $referrer: document.referrer || null,
          $page_visibility: document.visibilityState,
          $screen: window.screen ? window.screen.width + 'x' + window.screen.height : null,
          $viewport: window.innerWidth + 'x' + window.innerHeight,
        },
        referrerInfo(),
        buildDeviceContext(),
        getSuperProps(),
        attribution.firstTouch || {},
        attribution.lastTouch || {},
        properties || {},
      ),
      context: {
        library: 'oak.js',
        library_version: __OAK_VERSION__,
        page: { url: location.href, path: location.pathname, title: document.title, referrer: document.referrer || '' },
      },
    }
    if (Object.keys(traits).length) ev.traits = traits
    if (Object.keys(groups).length) ev.groups = groups
    return ev
  }

  return function track(name: string, properties?: Props): OakEvent | null {
    if (!shouldSample(name)) return null
    if (!limiter.consume()) { log('rate limited, dropping', name); return null }

    let ev: OakEvent | null = buildEvent(name, properties)

    // Strip denylisted properties (PII / noise) before any hook sees them.
    if (config.propertyDenylist.length) {
      for (const k of config.propertyDenylist) delete ev.properties[k]
    }

    // before_send hooks may mutate or drop the event. First drop wins.
    for (const fn of beforeSend) {
      try {
        ev = fn(ev) || null
      } catch (err) {
        log('before_send threw, dropping', name, err)
        return null
      }
      if (!ev) { log('before_send dropped', name); return null }
    }

    log('event', ev.event, ev.properties)
    enqueue(ev)
    return ev
  }
}
