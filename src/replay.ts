import type { Config, Log, Session, Track } from './types'
import type { OakReplayGlobal, RrwebEvent } from './replay-types'
import type { ReplayConfig } from './remote-config'

const FLUSH_INTERVAL_MS = 5_000
// Cap *uncompressed* NDJSON per chunk. Kept well under the transport's
// maxPayloadBytes (900KB) so one snapshot + a few analytics events still fit
// in a single batch when they end up sharing a flush.
const MAX_CHUNK_BYTES = 500_000
const RRWEB_CHECKOUT_MS = 30_000     // full snapshot every 30s for seekability

type ReplayInit = {
  entry_url: string
  viewport_w: number
  viewport_h: number
  browser?: string
  os?: string
  device_type?: string
}

export interface ReplayController {
  /** Mark the session as having an error (highlights it in the replay list). */
  noteError: () => void
  /** Stop recording and detach observers. */
  stop: () => void
}

export interface ReplayDeps {
  config: Config
  replay: ReplayConfig
  session: Session
  log: Log
  track: Track
  getMeta: () => Pick<ReplayInit, 'browser' | 'os' | 'device_type'>
}

export function installReplay(deps: ReplayDeps): ReplayController | null {
  if (!deps.replay.enabled) {
    deps.log('replay disabled for project')
    return null
  }
  return startRecording(deps)
}

// ─── Recorder ────────────────────────────────────────────────────────────────

function startRecording(deps: ReplayDeps): ReplayController {
  const { config, replay, session, log, track } = deps

  let buffer: RrwebEvent[] = []
  let bufferBytes = 0
  let seq = 0
  let stopRecording: (() => void) | null = null
  let sessionHasError = false

  loadReplayBundle(config)
    .then((api) => {
      if (!api) return
      stopRecording = api.record({
        emit(event, isCheckout) {
          handleEmit(event, isCheckout === true)
        },
        maskAllInputs: replay.mask_inputs,
        blockSelector: replay.block_selectors || undefined,
        sampling: {
          mousemove: 50,    // ms throttle
          scroll: 150,
          input: 'last',
        },
        checkoutEveryNms: RRWEB_CHECKOUT_MS,
        inlineStylesheet: true,
        collectFonts: false,
        recordCanvas: false,
      }) || null
      log('replay started', { sid: session.id })
    })
    .catch((err) => log('replay bundle load failed', err))

  function handleEmit(event: RrwebEvent, _isCheckout: boolean): void {
    const line = JSON.stringify(event)
    const size = line.length + 1 // newline
    if (size > MAX_CHUNK_BYTES) {
      log('replay event exceeds chunk cap, dropping', size)
      return
    }
    if (bufferBytes + size > MAX_CHUNK_BYTES) {
      flush()
    }
    buffer.push(event)
    bufferBytes += size
  }

  function buildInit(): ReplayInit {
    return {
      entry_url: location.href,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      ...deps.getMeta(),
    }
  }

  function flush(): void {
    if (buffer.length === 0) return
    const chunk = buffer
    buffer = []
    bufferBytes = 0
    const sequence = seq++

    const props: Record<string, unknown> = {
      $snapshot_data: chunk,
      $snapshot_seq: sequence,
      $replay_has_errors: sessionHasError,
    }
    // First chunk carries the init metadata used to denormalize the
    // replay_sessions row (entry URL, viewport, UA). Subsequent chunks just
    // bump the counter on the server.
    if (sequence === 0) {
      props.$replay_init = buildInit()
    }
    track('$snapshot', props)
  }

  const timer = setInterval(flush, FLUSH_INTERVAL_MS)

  // Flush the trailing buffer before the page goes away. The 5s timer alone
  // would lose anything emitted in the gap between the last tick and unload.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  const onPagehide = () => flush()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPagehide)

  return {
    noteError() {
      sessionHasError = true
    },
    stop() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPagehide)
      if (stopRecording) { try { stopRecording() } catch {} }
      flush()
    },
  }
}

// ─── Bundle loader ───────────────────────────────────────────────────────────

let bundlePromise: Promise<OakReplayGlobal | null> | null = null

function loadReplayBundle(config: Config): Promise<OakReplayGlobal | null> {
  if (bundlePromise) return bundlePromise
  const w = window as typeof window & { __oakReplay?: OakReplayGlobal }
  if (w.__oakReplay) return Promise.resolve(w.__oakReplay)

  bundlePromise = new Promise((resolve) => {
    const src = config.host + (config.replayBundlePath || '/oak-replay.js')
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve(w.__oakReplay || null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return bundlePromise
}
