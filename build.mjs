#!/usr/bin/env node
/**
 * Builds oakdata-js for npm consumption.
 *
 *   node build.mjs           # ESM + CJS, minified
 *   node build.mjs --watch   # rebuild on change (dev)
 */
import { build, context } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = new Set(process.argv.slice(2))
const watch = args.has('--watch')

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

const shared = {
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  target: ['es2020'],
  platform: 'browser',
  // Customers' bundlers minify final output; ship readable JS + sourcemap so
  // they can see what oak is doing in stack traces.
  minify: false,
  sourcemap: true,
  legalComments: 'inline',
  define: {
    'process.env.NODE_ENV': '"production"',
    __OAK_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: 'info',
}

const esm = { ...shared, format: 'esm', outfile: resolve(__dirname, 'dist/index.mjs') }
const cjs = { ...shared, format: 'cjs', outfile: resolve(__dirname, 'dist/index.cjs') }

if (watch) {
  const esmCtx = await context(esm)
  const cjsCtx = await context(cjs)
  await Promise.all([esmCtx.watch(), cjsCtx.watch()])
  console.log('[oakdata-js] watching for changes…')
} else {
  await Promise.all([build(esm), build(cjs)])
  console.log('[oakdata-js] built dist/index.mjs + dist/index.cjs')
}
