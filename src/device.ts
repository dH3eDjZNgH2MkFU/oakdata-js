import type { Config, Props } from './types'
import { hashString } from './util'

function isBrave(): boolean {
  try { return !!(navigator?.brave && typeof navigator.brave.isBrave === 'function') }
  catch { return false }
}

function isArc(): boolean {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')
    return !!(v && v.trim())
  } catch { return false }
}

export function uaParse(ua: string): Props {
  ua = ua || ''
  let browser = 'Other', browserVersion = ''
  let os = 'Other', osVersion = ''
  let device = 'Desktop'

  if (/iPhone|iPad|iPod/.test(ua)) { os = 'iOS'; device = /iPad/.test(ua) ? 'Tablet' : 'Mobile' }
  else if (/Android/.test(ua)) { os = 'Android'; device = /Mobile/.test(ua) ? 'Mobile' : 'Tablet' }
  else if (/Windows NT/.test(ua)) { os = 'Windows'; osVersion = (ua.match(/Windows NT ([\d.]+)/) || [])[1] || '' }
  else if (/Mac OS X/.test(ua)) { os = 'macOS'; osVersion = ((ua.match(/Mac OS X ([\d_.]+)/) || [])[1] || '').replace(/_/g, '.') }
  else if (/Linux/.test(ua)) { os = 'Linux' }
  else if (/CrOS/.test(ua)) { os = 'ChromeOS' }

  if (/Vivaldi\//.test(ua))             { browser = 'Vivaldi';          browserVersion = (ua.match(/Vivaldi\/([\d.]+)/) || [])[1] }
  else if (/SamsungBrowser\//.test(ua)) { browser = 'Samsung Internet'; browserVersion = (ua.match(/SamsungBrowser\/([\d.]+)/) || [])[1] }
  else if (/Edg\//.test(ua))            { browser = 'Edge';             browserVersion = (ua.match(/Edg\/([\d.]+)/) || [])[1] }
  else if (/OPR\//.test(ua))            { browser = 'Opera';            browserVersion = (ua.match(/OPR\/([\d.]+)/) || [])[1] }
  else if (/Firefox\//.test(ua))        { browser = 'Firefox';          browserVersion = (ua.match(/Firefox\/([\d.]+)/) || [])[1] }
  else if (/Chrome\//.test(ua))         {
    browserVersion = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || ''
    if (isBrave())    browser = 'Brave'
    else if (isArc()) browser = 'Arc'
    else              browser = 'Chrome'
  }
  else if (/Safari\//.test(ua))  { browser = 'Safari';  browserVersion = (ua.match(/Version\/([\d.]+)/) || [])[1] }

  return { browser, browser_version: browserVersion || '', os, os_version: osVersion, device_type: device }
}

export function screenInfo(): Props {
  const s = window.screen || ({} as Screen)
  return {
    screen_width: s.width,
    screen_height: s.height,
    screen_avail_width: s.availWidth,
    screen_avail_height: s.availHeight,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio,
    color_depth: s.colorDepth,
    orientation: (s.orientation && s.orientation.type) ||
      (window.matchMedia && window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'),
  }
}

export function networkInfo(): Props {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!c) return {}
  return {
    net_effective_type: c.effectiveType,
    net_downlink: c.downlink,
    net_rtt: c.rtt,
    net_save_data: c.saveData,
    net_type: c.type,
  }
}

export function localeInfo(): Props {
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch {}
  return {
    language: navigator.language,
    languages: navigator.languages && navigator.languages.slice(0, 5),
    timezone: tz,
    timezone_offset: new Date().getTimezoneOffset(),
  }
}

export function hardwareInfo(): Props {
  return {
    cpu_cores: navigator.hardwareConcurrency,
    device_memory_gb: navigator.deviceMemory,
    max_touch_points: navigator.maxTouchPoints,
    touch_support: 'ontouchstart' in window,
    cookies_enabled: navigator.cookieEnabled,
    pdf_viewer: navigator.pdfViewerEnabled,
    online: navigator.onLine,
  }
}

export function fingerprint(config: Config): Props {
  if (!config.fingerprint) return {}
  const out: Props = {}
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 240; canvas.height = 60
    const ctx = canvas.getContext('2d')!
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('oak.js fingerprint ✨', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('oak.js fingerprint ✨', 4, 17)
    out.canvas_hash = hashString(canvas.toDataURL())
  } catch {}
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        out.gl_vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
        out.gl_renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      }
      out.gl_version = gl.getParameter(gl.VERSION)
      out.gl_shading_lang = gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    }
  } catch {}
  try {
    const fonts = ['Arial','Times New Roman','Courier New','Georgia','Verdana','Tahoma','Comic Sans MS','Impact']
    const available: string[] = []
    for (const f of fonts) {
      if (document.fonts && typeof document.fonts.check === 'function' && document.fonts.check('12px ' + f)) {
        available.push(f)
      }
    }
    if (available.length) out.fonts_available = available
  } catch {}
  return out
}

/** Mutates ctx in place. UA Client Hints — more accurate than UA string parsing. */
export function fillUaCh(ctx: Props): void {
  const d = navigator.userAgentData
  if (!d) return
  try {
    const brand = (d.brands || []).find(b => !/Not[.A-Z]*Brand/i.test(b.brand)) || d.brands?.[0]
    if (brand) {
      ctx.ua_ch_brand = brand.brand
      ctx.ua_ch_brand_version = brand.version
    }
    if (d.mobile !== undefined) ctx.ua_ch_mobile = d.mobile
    if (d.platform) ctx.ua_ch_platform = d.platform
  } catch {}
  if (typeof d.getHighEntropyValues === 'function') {
    d.getHighEntropyValues(['platformVersion', 'model', 'uaFullVersion', 'architecture', 'bitness'])
      .then(hi => {
        if (hi.platformVersion) ctx.os_version = hi.platformVersion
        if (hi.uaFullVersion)   ctx.browser_version = hi.uaFullVersion
        if (hi.model)           ctx.device_model = hi.model
        if (hi.architecture)    ctx.cpu_arch = hi.architecture
        if (hi.bitness)         ctx.cpu_bitness = hi.bitness
        if (d.mobile)           ctx.device_type = 'Mobile'
      })
      .catch(() => {})
  }
}
