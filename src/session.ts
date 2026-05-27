import type { Config, Session, Storage, Props } from './types'
import { uuid } from './util'

export interface SessionState {
  current: Session
  pendingEnd: Props | null
  touch: () => void
}

export function createSession(config: Config, storage: Storage): SessionState {
  const { store, load } = storage

  function rotate(): { session: Session; previous: Session | null } {
    const now = Date.now()
    const prev = load<Session>('session')
    if (prev && prev.last && now - prev.last < config.sessionTimeoutMs) {
      prev.last = now
      store('session', prev)
      return { session: prev, previous: null }
    }
    const fresh: Session = {
      id: uuid(),
      start: now,
      last: now,
      n: ((prev && prev.n) || 0) + 1,
    }
    store('session', fresh)
    return { session: fresh, previous: prev || null }
  }

  const { session, previous } = rotate()

  const pendingEnd: Props | null = previous?.id
    ? {
        $previous_session_id: previous.id,
        $previous_session_number: previous.n,
        $previous_session_started_at: previous.start ? new Date(previous.start).toISOString() : null,
        $previous_session_ended_at: previous.last ? new Date(previous.last).toISOString() : null,
        $previous_session_duration_ms:
          previous.start && previous.last ? previous.last - previous.start : null,
      }
    : null

  function touch(): void {
    const s = load<Session>('session')
    if (s) { s.last = Date.now(); store('session', s) }
  }

  return { current: session, pendingEnd, touch }
}
