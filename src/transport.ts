import type { Config, Log, OakEvent, Storage } from './types'

const SCHEMA = 1

export interface Transport {
  enqueue: (event: OakEvent) => void
  flush: (useBeacon?: boolean) => Promise<void>
  persistQueue: () => void
  loadPersistedQueue: () => void
  setOptedOut: (v: boolean) => void
  clearQueue: () => void
}

export function createTransport(config: Config, storage: Storage, log: Log): Transport {
  let queue: OakEvent[] = []
  let optedOut = storage.load<boolean>('opt_out') === true
  let flushing = false
  let consecutiveFailures = 0
  let backoffUntil = 0

  function loadPersistedQueue(): void {
    const q = storage.load<OakEvent[]>('queue')
    if (q && q.length) queue = q.concat(queue)
    storage.clearKey('queue')
  }

  function persistQueue(): void {
    if (queue.length) storage.store('queue', queue)
  }

  function enqueue(event: OakEvent): void {
    if (optedOut) return
    queue.push(event)
    if (queue.length > config.maxQueueSize) queue = queue.slice(-config.maxQueueSize)
    if (queue.length >= config.flushBatchSize) void flush()
  }

  function takeChunk(): OakEvent[] {
    const max = config.maxPayloadBytes
    const out: OakEvent[] = []
    let bytes = 100 // envelope overhead
    while (queue.length && out.length < 500) {
      const ev = queue[0]
      const size = JSON.stringify(ev).length + 1
      if (size > max) {
        log('dropping oversized event', ev.event, size)
        queue.shift()
        continue
      }
      if (bytes + size > max) break
      out.push(queue.shift()!)
      bytes += size
    }
    return out
  }

  async function gzipPayload(text: string): Promise<Blob> {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    return await new Response(stream).blob()
  }

  async function sendBatch(body: string, useBeacon?: boolean): Promise<boolean> {
    const url = config.host + config.ingestPath
    if (useBeacon && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' })
        if (navigator.sendBeacon(url, blob)) return true
      } catch {}
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      let payload: string | Blob = body
      if (config.compress && typeof CompressionStream !== 'undefined' && body.length > 1024 && !useBeacon) {
        try { payload = await gzipPayload(body); headers['Content-Encoding'] = 'gzip' }
        catch {}
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
        credentials: 'omit',
        mode: 'cors',
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function flush(useBeacon?: boolean): Promise<void> {
    if (!queue.length || flushing || optedOut) return
    if (Date.now() < backoffUntil) return
    flushing = true
    try {
      while (queue.length) {
        const chunk = takeChunk()
        if (!chunk.length) break
        const body = JSON.stringify({
          v: SCHEMA,
          key: config.key,
          sent_at: new Date().toISOString(),
          events: chunk,
        })
        const ok = await sendBatch(body, useBeacon)
        if (!ok) {
          queue = chunk.concat(queue)
          consecutiveFailures++
          const wait = Math.min(60_000, 1000 * Math.pow(2, Math.min(consecutiveFailures, 6)))
          backoffUntil = Date.now() + wait
          persistQueue()
          log('flush failed, backing off', wait, 'ms')
          return
        }
        log('flushed', chunk.length, 'events')
        consecutiveFailures = 0
      }
    } finally {
      flushing = false
    }
  }

  function setOptedOut(v: boolean): void { optedOut = v }
  function clearQueue(): void { queue = [] }

  setInterval(() => { if (queue.length) void flush() }, config.flushIntervalMs)

  return { enqueue, flush, persistQueue, loadPersistedQueue, setOptedOut, clearQueue }
}
