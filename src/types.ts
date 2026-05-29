export type Props = Record<string, unknown>

/**
 * Hook run on every event just before it's enqueued. Return the (possibly
 * mutated) event to send it, or null/false to drop it. Multiple hooks run in
 * order; the first to drop wins.
 */
export type BeforeSend = (event: OakEvent) => OakEvent | null | false

export interface UserConfig {
  key?: string
  host?: string
  ingestPath?: string
  debug?: boolean
  autotrack?: boolean
  pageviews?: boolean
  fingerprint?: boolean
  captureInputs?: boolean
  outbound?: boolean
  deadClicks?: boolean
  longTasks?: boolean
  declarative?: boolean
  botFilter?: boolean
  compress?: boolean
  sessionTimeoutMs?: number
  flushIntervalMs?: number
  flushBatchSize?: number
  maxQueueSize?: number
  maxPayloadBytes?: number
  sampleRates?: Record<string, number>
  respectDnt?: boolean
  configPath?: string
  /** Property keys stripped from every event before send (PII / noise control). */
  propertyDenylist?: string[]
  /** Hook(s) to mutate or drop events before they're sent. */
  beforeSend?: BeforeSend | BeforeSend[]
  /** Sustained client-side capture rate (events/sec) before throttling kicks in. */
  rateLimitPerSecond?: number
  /** Token-bucket burst capacity for the capture rate limiter. */
  rateLimitBurst?: number
}

export interface Config {
  key: string
  host: string
  ingestPath: string
  debug: boolean
  autotrack: boolean
  pageviews: boolean
  fingerprint: boolean
  captureInputs: boolean
  outbound: boolean
  deadClicks: boolean
  longTasks: boolean
  declarative: boolean
  botFilter: boolean
  compress: boolean
  sessionTimeoutMs: number
  flushIntervalMs: number
  flushBatchSize: number
  maxQueueSize: number
  maxPayloadBytes: number
  sampleRates: Record<string, number>
  respectDnt: boolean
  configPath: string
  propertyDenylist: string[]
  beforeSend?: BeforeSend | BeforeSend[]
  rateLimitPerSecond: number
  rateLimitBurst: number
}

export type Log = (...args: unknown[]) => void

export interface Session {
  id: string
  start: number
  last: number
  n: number
}

export interface OakEvent {
  id: string
  event: string
  timestamp: string
  distinct_id: string
  anonymous_id: string
  session_id: string
  session_number: number
  session_started_at: string
  properties: Props
  context: {
    library: string
    library_version: string
    page: { url: string; path: string; title: string; referrer: string }
  }
  traits?: Props
  groups?: Record<string, { id: string; traits: Props }>
}

export type Touch = Record<string, string | number | null>

export interface UrlSnapshot {
  search: string
  href: string
  pathname: string
  referrer: string
}

export type Track = (name: string, properties?: Props) => OakEvent | null

export interface Storage {
  store: (key: string, value: unknown) => void
  load: <T = unknown>(key: string) => T | null
  clearKey: (key: string) => void
}

export interface OakApi {
  __loaded: true
  version: string
  config: Config
  capture: Track
  track: Track
  page: (props?: Props) => OakEvent | null
  identify: (userId: string | number, traits?: Props) => void
  alias: (newId: string | number) => void
  set: (traits: Props) => void
  setOnce: (traits: Props) => void
  register: (props: Props) => void
  unregister: (key: string) => void
  group: (type: string, id: string | number, traits?: Props) => void
  reset: () => void
  opt_out: () => void
  opt_in: () => void
  flush: (useBeacon?: boolean) => Promise<void>
  getDistinctId: () => string
  getSessionId: () => string
  getFirstTouch: () => Touch | null
  getLastTouch: () => Touch | null
}

// Build-time constants injected by esbuild
declare global {
  // eslint-disable-next-line no-var
  var __OAK_VERSION__: string
  interface Navigator {
    brave?: { isBrave: () => boolean }
    userAgentData?: {
      brands: { brand: string; version: string }[]
      mobile: boolean
      platform: string
      getHighEntropyValues: (hints: string[]) => Promise<{
        platformVersion?: string
        model?: string
        uaFullVersion?: string
        architecture?: string
        bitness?: string
      }>
    }
    connection?: NetworkInfo
    mozConnection?: NetworkInfo
    webkitConnection?: NetworkInfo
    deviceMemory?: number
    pdfViewerEnabled?: boolean
  }
  interface NetworkInfo {
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
    type?: string
  }
  interface Window {
    oak?: OakApi | unknown[]
    oakConfig?: UserConfig
    // Navigation API — experimental, not yet in lib.dom.d.ts.
    navigation?: {
      addEventListener: (type: string, listener: EventListener) => void
    }
  }
  interface PerformanceEntry {
    hadRecentInput?: boolean
    value?: number
    element?: Element
    url?: string
    size?: number
    renderTime?: number
    loadTime?: number
    attribution?: { name?: string; containerType?: string }[]
  }
}
