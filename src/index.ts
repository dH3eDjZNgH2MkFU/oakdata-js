/*!
 * oakdata-js — oakdata web analytics SDK
 *
 * Usage:
 *   // instrumentation-client.ts (Next.js 15+)
 *   import oak from 'oakdata-js'
 *
 *   oak.init(process.env.NEXT_PUBLIC_OAK_KEY!, {
 *     api_host: process.env.NEXT_PUBLIC_OAK_HOST,
 *   })
 */
import type { OakApi, Props, UrlSnapshot, UserConfig } from './types'
import { buildConfig, createLog } from './config'
import { createStorage } from './storage'
import { isBot } from './bot'
import { uuid } from './util'
import { createSession } from './session'
import { createAttribution } from './attribution'
import { createTransport } from './transport'
import { createTrack } from './events'
import { installAutocapture } from './autocapture'
import { installEngagement } from './engagement'
import { installVitals } from './vitals'
import { installErrorTracking } from './errors'
import { installNavigation } from './navigation'
import { installReplay, type ReplayController } from './replay'
import { loadRemoteConfig } from './remote-config'
import { uaParse } from './device'

export type { OakApi, Props } from './types'

/**
 * Options passed to `oak.init(key, options)`. Snake_case throughout to
 * match the JS-analytics convention; mapped internally to UserConfig.
 *
 * Unknown keys (e.g. `defaults`) are accepted and ignored — there for
 * forward-compatibility with future snapshotted defaults.
 */
export type InitOptions = {
  api_host?: string
  autocapture?: boolean
  capture_pageview?: boolean
  respect_dnt?: boolean
  debug?: boolean
  /** Version-pinned defaults marker, accepted for forward-compat (no-op today). */
  defaults?: string
  /** Called once the tracker is wired up. */
  loaded?: (oak: OakApi) => void
}

function mapOptions(options: InitOptions): Omit<UserConfig, 'key'> {
  return {
    host: options.api_host,
    debug: options.debug,
    autotrack: options.autocapture,
    pageviews: options.capture_pageview,
    respectDnt: options.respect_dnt,
  }
}

function bootstrap(userConfig: UserConfig): OakApi | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR no-op. Customers can call this from Next.js instrumentation-client.ts;
    // we don't want it to blow up during prerender.
    return null
  }

  const existing = window.oak as OakApi | unknown[] | undefined
  if (existing && !Array.isArray(existing) && (existing as OakApi).__loaded) {
    return existing as OakApi
  }

  // SPA routers may strip UTM params during hydration — capture synchronously.
  const initialUrl: UrlSnapshot = {
    search: location.search,
    href: location.href,
    pathname: location.pathname,
    referrer: document.referrer || '',
  }

  const { config } = buildConfig(userConfig)
  const log = createLog(config)

  if (!config.key) { log('No key configured — refusing to start.'); return null }
  if (config.respectDnt && (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes')) {
    log('DNT honored — tracker disabled.'); return null
  }
  if (config.botFilter && isBot()) { log('Bot detected — tracker disabled.'); return null }

  const storage = createStorage()
  const { store, load, clearKey } = storage

  let distinctId = (() => {
    let id = load<string>('distinct_id')
    if (!id) { id = uuid(); store('distinct_id', id) }
    return id
  })()

  const session = createSession(config, storage)

  const attribution = createAttribution(storage)
  attribution.capture(initialUrl)

  let traits: Props = load<Props>('traits') || {}
  let superProps: Props = load<Props>('super') || {}
  let groups: Record<string, { id: string; traits: Props }> =
    load<Record<string, { id: string; traits: Props }>>('groups') || {}

  const transport = createTransport(config, storage, log)
  const { enqueue, flush, persistQueue, loadPersistedQueue, setOptedOut, clearQueue } = transport

  const track = createTrack({
    config,
    log,
    session: session.current,
    attribution,
    storage,
    getDistinctId: () => load<string>('user_id') || distinctId,
    getAnonId: () => distinctId,
    getTraits: () => traits,
    getSuperProps: () => superProps,
    getGroups: () => groups,
    touchSession: session.touch,
    enqueue,
  })

  if (session.pendingEnd) track('$session_end', session.pendingEnd)

  const vitals = installVitals(config, track, log)
  const engagement = installEngagement(track, {
    touchSession: session.touch,
    flush,
    persistQueue,
    onHidden: vitals.emitInpFinal,
    onLeave: () => { vitals.emitInpFinal(); vitals.emitClsFinal() },
  })

  if (config.autotrack) installAutocapture(config, track)

  let replayController: ReplayController | null = null
  loadRemoteConfig(config, storage, log).then((remote) => {
    replayController = installReplay({
      config,
      replay: remote.replay,
      session: session.current,
      log,
      track,
      getMeta: () => {
        const ua = uaParse(navigator.userAgent || '')
        return {
          browser: ua.browser as string | undefined,
          os: ua.os as string | undefined,
          device_type: ua.device_type as string | undefined,
        }
      },
    })
  })

  installErrorTracking(track, {
    onError: () => {
      if (replayController) replayController.noteError()
    },
  })

  let lastUrl = location.href
  installNavigation({
    onLocationChange: () => {
      if (location.href === lastUrl) return
      engagement.emitLeave('spa_navigation')
      lastUrl = location.href
      engagement.reset()
      vitals.reset()
      attribution.capture()
      if (config.pageviews) track('$pageview')
    },
    onPagehidePersisted: () => { persistQueue(); void flush(true) },
    onPagehideUnload: () => engagement.emitLeave('pagehide'),
    onPageshowRestored: () => {
      lastUrl = location.href
      engagement.reset()
      vitals.reset()
      if (config.pageviews) track('$pageview', { $bfcache_restore: true })
    },
  })

  loadPersistedQueue()
  void flush()

  if (config.pageviews) {
    const firePerf = () => {
      track('$pageview')
      if (typeof requestIdleCallback === 'function') requestIdleCallback(vitals.capture, { timeout: 2000 })
      else setTimeout(vitals.capture, 0)
    }
    if (document.readyState === 'complete') firePerf()
    else addEventListener('load', firePerf)
  }

  const api: OakApi = {
    __loaded: true,
    version: __OAK_VERSION__,
    config,
    capture: track,
    track,
    page: props => track('$pageview', props),
    identify(userId, newTraits) {
      if (userId) {
        const prevAnon = distinctId
        store('user_id', String(userId))
        track('$identify', { $user_id: String(userId), $anon_distinct_id: prevAnon })
      }
      if (newTraits) api.set(newTraits)
    },
    alias(newId) {
      track('$alias', { $previous_id: distinctId, $new_id: String(newId) })
      store('distinct_id', String(newId))
      distinctId = String(newId)
    },
    set(newTraits) {
      Object.assign(traits, newTraits || {})
      store('traits', traits)
      track('$set', { $traits: newTraits })
    },
    setOnce(newTraits) {
      const changed: Props = {}
      Object.keys(newTraits || {}).forEach(k => {
        if (!(k in traits)) { traits[k] = (newTraits as Props)[k]; changed[k] = (newTraits as Props)[k] }
      })
      if (Object.keys(changed).length) {
        store('traits', traits)
        track('$set_once', { $traits: changed })
      }
    },
    register(props) {
      Object.assign(superProps, props || {})
      store('super', superProps)
    },
    unregister(key) {
      delete superProps[key]
      store('super', superProps)
    },
    group(type, id, groupTraits) {
      if (!type || !id) return
      groups[String(type)] = { id: String(id), traits: groupTraits || {} }
      store('groups', groups)
      track('$group', {
        $group_type: String(type),
        $group_id: String(id),
        $group_traits: groupTraits || null,
      })
    },
    reset() {
      ['distinct_id','user_id','session','first_touch_flat','last_touch_flat','traits','super','groups','queue']
        .forEach(clearKey)
      attribution.firstTouch = null
      attribution.lastTouch = null
      distinctId = (() => { const id = uuid(); store('distinct_id', id); return id })()
      traits = {}
      superProps = {}
      groups = {}
    },
    opt_out() { setOptedOut(true); store('opt_out', true); clearQueue() },
    opt_in() { setOptedOut(false); clearKey('opt_out') },
    flush,
    getDistinctId: () => load<string>('user_id') || distinctId,
    getSessionId: () => session.current.id,
    getFirstTouch: () => attribution.firstTouch,
    getLastTouch: () => attribution.lastTouch,
  }

  window.oak = api
  log('oak ready', { version: __OAK_VERSION__, distinctId, sessionId: session.current.id })
  return api
}

// ─── Singleton API ───────────────────────────────────────────────────────────
//
// Customers import the default and call `oak.init(key, options)` once. Method
// calls before init are queued and replayed once the tracker comes up, so it's
// safe to fire `oak.capture(...)` from anywhere without worrying about ordering.

type QueuedCall = { method: keyof OakApi; args: unknown[] }
let liveApi: OakApi | null = null
const preInitQueue: QueuedCall[] = []

function proxy<K extends keyof OakApi>(method: K) {
  return (...args: unknown[]): void => {
    if (liveApi) {
      ;(liveApi[method] as (...a: unknown[]) => unknown)(...args)
    } else {
      preInitQueue.push({ method, args })
    }
  }
}

const oak = {
  /**
   * Boot the tracker. Returns the underlying API instance (also kept on
   * `window.oak`). Calling twice is a no-op — the first init wins.
   */
  init(key: string, options: InitOptions = {}): OakApi | null {
    if (liveApi) return liveApi
    const userConfig: UserConfig = { key, ...mapOptions(options) }
    liveApi = bootstrap(userConfig)
    if (liveApi) {
      const drained = liveApi
      for (const { method, args } of preInitQueue) {
        const fn = drained[method] as unknown
        if (typeof fn === 'function') (fn as (...a: unknown[]) => unknown)(...args)
      }
      preInitQueue.length = 0
      if (options.loaded) {
        try { options.loaded(drained) } catch {}
      }
    }
    return liveApi
  },

  capture: proxy('capture'),
  track: proxy('track'),
  identify: proxy('identify'),
  page: proxy('page'),
  alias: proxy('alias'),
  set: proxy('set'),
  setOnce: proxy('setOnce'),
  register: proxy('register'),
  unregister: proxy('unregister'),
  group: proxy('group'),
  reset: proxy('reset'),
  opt_out: proxy('opt_out'),
  opt_in: proxy('opt_in'),
  flush: proxy('flush'),

  // Getters return null pre-init rather than queuing — values aren't known yet.
  getDistinctId(): string | null { return liveApi?.getDistinctId() ?? null },
  getSessionId(): string | null { return liveApi?.getSessionId() ?? null },
}

export default oak

