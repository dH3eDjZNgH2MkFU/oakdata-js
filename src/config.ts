import type { Config, UserConfig, Log } from './types'
import { bool, num } from './util'

export function buildConfig(user: UserConfig): { config: Config } {
  if (!user || typeof user !== 'object') {
    throw new Error('oakdata-js: init() called without a config object')
  }

  const defaultHost = typeof location !== 'undefined' ? location.origin : ''

  const config: Config = {
    key: user.key || '',
    host: (user.host || defaultHost).replace(/\/$/, ''),
    ingestPath: user.ingestPath || '/api/oak/ingest',
    debug: bool(user.debug, false),
    autotrack: bool(user.autotrack, true),
    pageviews: bool(user.pageviews, true),
    fingerprint: bool(user.fingerprint, true),
    captureInputs: bool(user.captureInputs, false),
    outbound: bool(user.outbound, true),
    deadClicks: bool(user.deadClicks, true),
    longTasks: bool(user.longTasks, true),
    declarative: bool(user.declarative, true),
    botFilter: bool(user.botFilter, true),
    compress: bool(user.compress, true),
    sessionTimeoutMs: user.sessionTimeoutMs || 30 * 60 * 1000,
    flushIntervalMs: user.flushIntervalMs || 5000,
    flushBatchSize: user.flushBatchSize || 25,
    maxQueueSize: user.maxQueueSize || 500,
    maxPayloadBytes: user.maxPayloadBytes || 900_000,
    sampleRates: Object.assign(
      { $click: num(undefined, 1), $input_change: 1, $paint: 1, $long_task: 1 },
      user.sampleRates || {},
    ),
    respectDnt: bool(user.respectDnt, false),
    configPath: user.configPath || '/api/oak/config',
  }

  return { config }
}

export function createLog(config: Config): Log {
  return config.debug
    ? (...args: unknown[]) => { try { console.log('[oak]', ...args) } catch {} }
    : () => {}
}
