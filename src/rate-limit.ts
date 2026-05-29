import type { Log } from './types'

export interface RateLimiter {
  /** Returns true if a token was available (event allowed), false if throttled. */
  consume: () => boolean
}

/**
 * Token-bucket limiter. Refills `perSecond` tokens each second up to `burst`.
 * Guards against a runaway capture loop (e.g. tracking inside a render loop)
 * flooding the network, without throttling normal usage — a burst of `burst`
 * absorbs legitimate spikes, then sustained traffic is capped at `perSecond`.
 */
export function createRateLimiter(perSecond: number, burst: number, log: Log): RateLimiter {
  let tokens = burst
  let last = Date.now()
  let dropped = 0

  return {
    consume(): boolean {
      const now = Date.now()
      tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSecond)
      last = now
      if (tokens >= 1) {
        tokens -= 1
        if (dropped) {
          log('rate limit recovered —', dropped, 'event(s) dropped')
          dropped = 0
        }
        return true
      }
      dropped++
      return false
    },
  }
}
