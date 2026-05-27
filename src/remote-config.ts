import type { Config, Log, Storage } from './types'

export type ReplayConfig = {
  enabled: boolean
  mask_inputs: boolean
  block_selectors: string | null
}

export type RemoteConfig = {
  v: number
  replay: ReplayConfig
}

type CachedConfig = {
  fetched_at: number
  ttl_ms: number
  config: RemoteConfig
}

const CACHE_KEY = 'remote_config'
const DEFAULT_TTL_MS = 5 * 60 * 1000

const FALLBACK: RemoteConfig = {
  v: 1,
  replay: {
    enabled: false,
    mask_inputs: true,
    block_selectors: null,
  },
}

/**
 * Returns the project's feature config — fetched from the server, cached in
 * localStorage with a TTL. The tracker can keep running while this resolves;
 * features that depend on it gate on the resolved value.
 *
 * Stale cache is preferred over a blank fallback when the network is slow or
 * down — features stay "as last seen" rather than flickering off.
 */
export function loadRemoteConfig(
  config: Config,
  storage: Storage,
  log: Log
): Promise<RemoteConfig> {
  const cached = storage.load<CachedConfig>(CACHE_KEY)
  const fresh = cached && Date.now() - cached.fetched_at < cached.ttl_ms

  if (fresh && cached) {
    return Promise.resolve(cached.config)
  }

  // No cache or expired — fetch in background. If we had stale cache, return
  // that immediately and let the fetch refresh for next time.
  const fetchPromise = fetchConfig(config, log).then((next) => {
    if (next) {
      const entry: CachedConfig = {
        fetched_at: Date.now(),
        ttl_ms: DEFAULT_TTL_MS,
        config: next,
      }
      storage.store(CACHE_KEY, entry)
      return next
    }
    return cached?.config || FALLBACK
  })

  if (cached) return Promise.resolve(cached.config)
  return fetchPromise
}

async function fetchConfig(config: Config, log: Log): Promise<RemoteConfig | null> {
  try {
    const url = config.host + config.configPath + '?key=' + encodeURIComponent(config.key)
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
    })
    if (!res.ok) {
      log('remote config fetch failed', res.status)
      return null
    }
    const body = (await res.json()) as Partial<RemoteConfig> & { ttl?: number }
    if (!body || typeof body !== 'object') return null

    const replay = (body.replay || {}) as Partial<ReplayConfig>
    return {
      v: typeof body.v === 'number' ? body.v : 1,
      replay: {
        enabled: replay.enabled === true,
        mask_inputs: replay.mask_inputs !== false,
        block_selectors:
          typeof replay.block_selectors === 'string' ? replay.block_selectors : null,
      },
    }
  } catch (err) {
    log('remote config fetch error', err)
    return null
  }
}
