import type { Config, Props, Track } from './types'

const ACTION_TAGS = new Set(['A','BUTTON','INPUT','SELECT','TEXTAREA','LABEL','SUMMARY'])

function actionableAncestor(el: Element): Element {
  let node: Node | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 8) {
    const e = node as Element
    if (ACTION_TAGS.has(e.tagName)) return e
    const role = e.getAttribute && e.getAttribute('role')
    if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') return e
    if ((e as HTMLElement).onclick) return e
    node = e.parentNode
    depth++
  }
  return el
}

export function cssSelector(el: Element | null): string {
  if (!el || el.nodeType !== 1) return ''
  if (el.id) return '#' + el.id
  const parts: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 6) {
    let sel = node.tagName.toLowerCase()
    if (node.id) { parts.unshift(sel + '#' + node.id); break }
    if (typeof node.className === 'string') {
      const cls = node.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      if (cls) sel += '.' + cls
    }
    const parent = node.parentNode as Element | null
    if (parent) {
      const siblings = parent.children
      if (siblings && siblings.length > 1) {
        const idx = Array.prototype.indexOf.call(siblings, node) + 1
        sel += ':nth-child(' + idx + ')'
      }
    }
    parts.unshift(sel)
    node = node.parentNode as Element | null
    depth++
  }
  return parts.join(' > ')
}

function elDescriptor(el: Element | null, captureInputs: boolean): Props | null {
  if (!el || el.nodeType !== 1) return null
  const attrs: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'value' && !captureInputs) continue
    if (a.name === 'style') continue
    attrs[a.name] = a.value && a.value.length > 200 ? a.value.slice(0, 200) : a.value
  }
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : [],
    text: ((el.textContent || '').trim().slice(0, 200)) || null,
    name: el.getAttribute && el.getAttribute('name'),
    href: el.tagName === 'A' ? (el as HTMLAnchorElement).href : null,
    attrs,
    selector: cssSelector(el),
  }
}

function ancestorChain(el: Node | null): Props[] {
  const chain: Props[] = []
  let node = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 5) {
    const e = node as Element
    chain.push({
      tag: e.tagName.toLowerCase(),
      id: e.id || null,
      classes: typeof e.className === 'string' ? e.className.split(/\s+/).filter(Boolean) : [],
    })
    node = e.parentNode
    depth++
  }
  return chain
}

function ignoredAncestor(el: Node | null): boolean {
  let node = el
  while (node && node.nodeType === 1) {
    const e = node as Element
    if (e.getAttribute && e.getAttribute('data-oak-ignore') !== null) return true
    node = e.parentNode
  }
  return false
}

function declarativeFromAncestor(el: Element): { name: string; props: Props } | null {
  let node: Node | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 8) {
    const e = node as Element
    const evName = e.getAttribute && e.getAttribute('data-oak-event')
    if (evName) {
      const props: Props = {}
      for (const a of Array.from(e.attributes)) {
        if (a.name.indexOf('data-oak-prop-') === 0) {
          props[a.name.slice('data-oak-prop-'.length)] = a.value
        }
      }
      return { name: evName, props }
    }
    node = e.parentNode
    depth++
  }
  return null
}

export function installAutocapture(config: Config, track: Track): void {
  const lastClick = { ts: 0, x: 0, y: 0, count: 0 }

  function watchDeadClick(target: Element, baseProps: Props): void {
    if (!config.deadClicks) return
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
    let mutated = false, navigated = false
    const mo = new MutationObserver(() => { mutated = true; mo.disconnect() })
    try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }) }
    catch { return }
    const onNav = () => { navigated = true }
    addEventListener('oak:locationchange', onNav, { once: true })
    setTimeout(() => {
      try { mo.disconnect() } catch {}
      removeEventListener('oak:locationchange', onNav)
      if (!mutated && !navigated) track('$dead_click', baseProps)
    }, 300)
  }

  function onClick(e: MouseEvent): void {
    const raw = e.target as Element | null
    if (!raw || ignoredAncestor(raw)) return
    const target = actionableAncestor(raw)

    if (config.declarative) {
      const dec = declarativeFromAncestor(target)
      if (dec) {
        track(dec.name, Object.assign({ $element: elDescriptor(target, config.captureInputs) }, dec.props))
      }
    }

    const rageDelta = e.timeStamp - lastClick.ts
    const rageDist = Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y)
    if (rageDelta < 1000 && rageDist < 30) lastClick.count++
    else lastClick.count = 1
    lastClick.ts = e.timeStamp; lastClick.x = e.clientX; lastClick.y = e.clientY

    const elDesc = elDescriptor(target, config.captureInputs)
    const props: Props = {
      $element: elDesc,
      $raw_element: raw === target ? null : elDescriptor(raw, config.captureInputs),
      $ancestors: ancestorChain(target.parentNode),
      $click_x: e.clientX, $click_y: e.clientY,
      $page_x: e.pageX, $page_y: e.pageY,
      $button: e.button,
      $meta_key: e.metaKey, $ctrl_key: e.ctrlKey, $shift_key: e.shiftKey, $alt_key: e.altKey,
    }
    track('$click', props)

    if (lastClick.count >= 3) {
      track('$rage_click', Object.assign({ $click_count: lastClick.count }, props))
    }

    if (config.outbound && target.tagName === 'A' && (target as HTMLAnchorElement).href) {
      try {
        const u = new URL((target as HTMLAnchorElement).href, location.href)
        if (u.host && u.host !== location.host && /^https?:/.test(u.protocol)) {
          track('$outbound_click', {
            $element: elDesc,
            $href: u.href,
            $outbound_host: u.host,
            $outbound_path: u.pathname,
          })
        }
      } catch {}
    }

    watchDeadClick(target, props)
  }

  function onSubmit(e: Event): void {
    const form = e.target as HTMLFormElement | null
    if (!form || form.tagName !== 'FORM' || ignoredAncestor(form)) return
    const fields: Props[] = []
    const inputs = form.querySelectorAll('input, textarea, select')
    inputs.forEach(input => {
      const i = input as HTMLInputElement
      if (i.type === 'password') return
      const field: Props = {
        name: i.name || null,
        type: i.type || i.tagName.toLowerCase(),
        id: i.id || null,
        required: !!i.required,
      }
      if (config.captureInputs && i.type !== 'hidden') field.value = String(i.value || '').slice(0, 200)
      else field.has_value = !!i.value
      fields.push(field)
    })
    track('$form_submit', {
      $element: elDescriptor(form, config.captureInputs),
      $form_action: form.action,
      $form_method: (form.method || 'GET').toUpperCase(),
      $form_id: form.id || null,
      $form_name: form.name || null,
      $fields: fields,
    })
  }

  function onChange(e: Event): void {
    const t = e.target as HTMLInputElement | null
    if (!t || !t.tagName) return
    if (t.tagName !== 'INPUT' && t.tagName !== 'SELECT' && t.tagName !== 'TEXTAREA') return
    if (t.type === 'password' || ignoredAncestor(t)) return
    const props: Props = {
      $element: elDescriptor(t, config.captureInputs),
      $field_name: t.name || null,
      $field_type: t.type || t.tagName.toLowerCase(),
    }
    if (config.captureInputs) props.$field_value = String(t.value || '').slice(0, 200)
    else props.$has_value = !!t.value
    track('$input_change', props)
  }

  function onCopy(e: ClipboardEvent): void {
    if (ignoredAncestor(e.target as Node | null)) return
    let selection = ''
    try { selection = String(window.getSelection ? window.getSelection() : '').slice(0, 200) } catch {}
    track('$copy', {
      $element: elDescriptor(e.target as Element | null, config.captureInputs),
      $selection_length: selection.length,
      $selection_preview: selection,
    })
  }

  addEventListener('click', onClick, true)
  addEventListener('submit', onSubmit, true)
  addEventListener('change', onChange, true)
  addEventListener('copy', onCopy, true)
}
