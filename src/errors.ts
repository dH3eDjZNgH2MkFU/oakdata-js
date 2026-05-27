import type { Track } from './types'

export interface ErrorTrackingHooks {
  /** Called whenever an unhandled error or rejection fires. */
  onError?: () => void
}

export function installErrorTracking(track: Track, hooks: ErrorTrackingHooks = {}): void {
  addEventListener('error', (e: ErrorEvent) => {
    if (hooks.onError) try { hooks.onError() } catch {}
    track('$error', {
      $message: e.message,
      $filename: e.filename,
      $line: e.lineno,
      $col: e.colno,
      $stack: e.error?.stack ? String(e.error.stack).slice(0, 2000) : null,
    })
  })
  addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (hooks.onError) try { hooks.onError() } catch {}
    const reason = (e.reason || {}) as { message?: string; stack?: string }
    track('$unhandled_rejection', {
      $message: reason.message || String(e.reason),
      $stack: reason.stack ? String(reason.stack).slice(0, 2000) : null,
    })
  })
}
