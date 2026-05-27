// Shared between the main tracker and the rrweb bundle. Kept in its own file
// so the main tracker can reference these types without pulling rrweb into
// its bundle.

export type RrwebEvent = {
  type: number
  data: unknown
  timestamp: number
}

export type RrwebRecordOptions = {
  emit?: (event: RrwebEvent, isCheckout?: boolean) => void
  maskAllInputs?: boolean
  maskInputOptions?: Record<string, boolean>
  maskTextSelector?: string
  blockSelector?: string
  ignoreSelector?: string
  sampling?: {
    mousemove?: number | boolean
    scroll?: number
    input?: 'all' | 'last'
  }
  checkoutEveryNms?: number
  checkoutEveryNth?: number
  recordCanvas?: boolean
  collectFonts?: boolean
  inlineStylesheet?: boolean
}

export type RrwebRecordFn = (
  options: RrwebRecordOptions
) => (() => void) | undefined

export type OakReplayGlobal = {
  version: string
  record: RrwebRecordFn
}
