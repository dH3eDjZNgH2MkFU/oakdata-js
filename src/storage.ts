import type { Storage } from './types'

const PREFIX = 'oak_'

function lsAvailable(): boolean {
  try {
    const t = '__oak_t__'
    localStorage.setItem(t, t)
    localStorage.removeItem(t)
    return true
  } catch { return false }
}

function setCookie(name: string, value: string, days: number): void {
  let expires = ''
  if (days) {
    const d = new Date()
    d.setTime(d.getTime() + days * 864e5)
    expires = '; expires=' + d.toUTCString()
  }
  let domain = ''
  try {
    const host = location.hostname.split('.')
    if (host.length >= 2) domain = '; domain=.' + host.slice(-2).join('.')
  } catch {}
  document.cookie =
    name + '=' + encodeURIComponent(value) + expires + '; path=/' + domain + '; SameSite=Lax'
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function delCookie(name: string): void { setCookie(name, '', -1) }

export function createStorage(): Storage {
  const HAS_LS = lsAvailable()

  function store(key: string, value: unknown): void {
    const k = PREFIX + key
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    if (HAS_LS) {
      try { localStorage.setItem(k, v); return } catch {}
    }
    setCookie(k, v, 365)
  }

  function load<T = unknown>(key: string): T | null {
    const k = PREFIX + key
    let raw: string | null = null
    if (HAS_LS) {
      try { raw = localStorage.getItem(k) } catch {}
    }
    if (raw === null) raw = getCookie(k)
    if (raw === null) return null
    try { return JSON.parse(raw) as T } catch { return raw as unknown as T }
  }

  function clearKey(key: string): void {
    const k = PREFIX + key
    if (HAS_LS) { try { localStorage.removeItem(k) } catch {} }
    delCookie(k)
  }

  return { store, load, clearKey }
}
