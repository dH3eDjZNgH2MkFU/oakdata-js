import type { Storage, Touch, UrlSnapshot, Props } from './types'
import { parseQuery, referrerHost } from './util'

export const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']
export const CLICK_IDS = ['gclid','fbclid','msclkid','ttclid','li_fat_id','twclid','igshid','dclid','wbraid','gbraid','yclid']

export interface AttributionState {
  firstTouch: Touch | null
  lastTouch: Touch | null
  /** Reads location; pass an explicit snapshot for landing URL capture. */
  capture: (snapshot?: UrlSnapshot) => Record<string, string>
}

export function createAttribution(storage: Storage): AttributionState {
  const state: AttributionState = {
    firstTouch: storage.load<Touch>('first_touch_flat'),
    lastTouch: storage.load<Touch>('last_touch_flat'),
    capture(snapshot?: UrlSnapshot): Record<string, string> {
      const src = snapshot || {
        search: location.search,
        href: location.href,
        pathname: location.pathname,
        referrer: document.referrer || '',
      }
      const q = parseQuery(src.search)
      const attribution: Record<string, string> = {}
      UTM_KEYS.concat(CLICK_IDS).forEach(k => { if (q[k]) attribution[k] = q[k] })
      const hasAttribution = Object.keys(attribution).length > 0
      const refHost = referrerHost(src.referrer)

      if (!state.firstTouch) {
        const ft: Touch = {
          $initial_timestamp: new Date().toISOString(),
          $initial_referrer: src.referrer || null,
          $initial_referring_domain: refHost || null,
          $initial_landing_url: src.href,
          $initial_landing_path: src.pathname,
        }
        UTM_KEYS.concat(CLICK_IDS).forEach(k => { ft['$initial_' + k] = attribution[k] || null })
        state.firstTouch = ft
        storage.store('first_touch_flat', ft)
      }

      if (hasAttribution) {
        const lt: Touch = {
          $latest_timestamp: new Date().toISOString(),
          $latest_referrer: src.referrer || null,
          $latest_referring_domain: refHost || null,
          $latest_landing_url: src.href,
        }
        UTM_KEYS.concat(CLICK_IDS).forEach(k => { lt['$latest_' + k] = attribution[k] || null })
        state.lastTouch = lt
        storage.store('last_touch_flat', lt)
      }

      return attribution
    },
  }
  return state
}

export function referrerInfo(): Props {
  const ref = document.referrer || ''
  const host = referrerHost(ref)
  return {
    referrer: ref,
    referring_domain: host,
    same_domain_referrer: !!host && host === location.hostname,
  }
}
