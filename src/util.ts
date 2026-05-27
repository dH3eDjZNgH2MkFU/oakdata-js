export const bool = (v: unknown, dflt: boolean): boolean => {
  if (v === undefined || v === null || v === '') return dflt
  if (v === true || v === '1' || v === 1 || v === 'true') return true
  if (v === false || v === '0' || v === 0 || v === 'false') return false
  return dflt
}

export const num = (v: unknown, dflt: number): number => {
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : dflt
}

export const pick = <T>(a: T | undefined, b: T | undefined): T | undefined =>
  a !== undefined ? a : b

export function uuid(): string {
  if (crypto && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch {}
  }
  const b = new Uint8Array(16)
  if (crypto && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h: string[] = []
  for (let j = 0; j < 16; j++) h.push((b[j] + 0x100).toString(16).slice(1))
  return (
    h.slice(0, 4).join('') + '-' +
    h.slice(4, 6).join('') + '-' +
    h.slice(6, 8).join('') + '-' +
    h.slice(8, 10).join('') + '-' +
    h.slice(10, 16).join('')
  )
}

export function hashString(str: string): string {
  // FNV-1a 32-bit — cheap, non-cryptographic
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16)
}

export function parseQuery(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  ;(s || '').replace(/^\?/, '').split('&').forEach(kv => {
    if (!kv) return
    const parts = kv.split('=')
    try {
      out[decodeURIComponent(parts[0])] = decodeURIComponent((parts[1] || '').replace(/\+/g, ' '))
    } catch {}
  })
  return out
}

export function referrerHost(ref: string): string {
  try { return ref ? new URL(ref).hostname : '' } catch { return '' }
}
