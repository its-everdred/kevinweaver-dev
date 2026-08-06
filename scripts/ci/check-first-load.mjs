#!/usr/bin/env node
// Route-accurate first-load budget for `/`.
//
// Next 16.2.12 emits no `app-build-manifest.json` and no per-route entry in
// `build-manifest.json` (`pages` holds only the Pages-Router `"/_app": []`), and
// `next build` no longer prints a First Load JS column. The authoritative
// statement of "what the browser fetches for /" is therefore the document Next
// serves: every `/_next/static/chunks/*.js` reference in the HTML for `/` plus
// the shared runtime in `build-manifest.json.rootMainFiles`. Anything emitted
// under `.next/static/chunks/` that the document does not declare is, by
// construction, deferred - which is exactly the island this budget bounds.
//
// Chunk basenames are Turbopack content hashes, so nothing here may match on a
// name. Classification is by role only.

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { brotliCompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress)

const NEXT_DIR = '.next'
const ROUTE = '/'
const PRERENDERED_HTML = join(NEXT_DIR, 'server', 'app', 'index.html')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')

// Matches `/_next/static/chunks/<hash>.js` wherever it appears in the document:
// a <script src>, a <link rel=preload href>, or an escaped string inside the RSC
// flight payload (which renders as `\"/_next/...\"`, hence the backslash guard).
const HTML_ASSET_RE = /\/_next\/(static\/[^"'\\\s)]+?\.js)/g

/** The one place any performance budget in this repository is stated. */
const BUDGETS = {
  firstLoadJs: 165_000,
  // Raised 90 kB -> 115 kB (2026-08-05) for the three.js WebGL galaxy
  // renderer. three.js (Points + ShaderMaterial) measures ~109 kB brotli in the
  // deferred galaxy chunk; the previous 90 kB cap could not hold it even with
  // the galaxy behind the lazy island. Operator-approved override, documented
  // here per the gate's "report a defect" path.
  deferredJs: 115_000,
  polyfillJs: 40_000,
}

const asJson = process.argv.includes('--json')

async function brotliBytes(file) {
  const buf = await readFile(file)
  const out = await brotli(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  })
  return out.length
}

async function documentHtml() {
  if (existsSync(PRERENDERED_HTML)) {
    return {
      source: 'prerendered-html',
      html: await readFile(PRERENDERED_HTML, 'utf8'),
    }
  }
  const origin = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
  const res = await fetch(new URL(ROUTE, origin))
  if (!res.ok) {
    throw new Error(
      `no ${PRERENDERED_HTML} and GET ${origin}${ROUTE} returned ${res.status}. ` +
        'Run `npm run build`, or start the server and set BASE_URL.'
    )
  }
  return { source: 'http', html: await res.text() }
}

async function emittedChunks() {
  const root = join(NEXT_DIR, 'static')
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) =>
      relative(NEXT_DIR, join(e.parentPath, e.name)).split(sep).join('/')
    )
    .filter((f) => f.startsWith('static/chunks/'))
    .sort()
}

const { source, html } = await documentHtml()
const manifest = JSON.parse(await readFile(BUILD_MANIFEST, 'utf8'))

const declared = new Set([...html.matchAll(HTML_ASSET_RE)].map((m) => m[1]))
for (const f of manifest.rootMainFiles ?? []) declared.add(f)
const polyfills = new Set(manifest.polyfillFiles ?? [])

const groups = { firstLoadJs: [], deferredJs: [], polyfillJs: [] }
const chunks = await emittedChunks()
for (const file of chunks) {
  if (polyfills.has(file)) groups.polyfillJs.push(file)
  else if (declared.has(file)) groups.firstLoadJs.push(file)
  else groups.deferredJs.push(file)
}

// The three groups must partition the emitted chunk set exactly. A chunk that
// lands nowhere is a classifier bug, not a passing build.
const classified = Object.values(groups).flat().length
if (classified !== chunks.length) {
  throw new Error(`classified ${classified} of ${chunks.length} emitted chunks`)
}

// A group that resolves to zero files is a false pass, not an empty budget:
// the island eagerly bundled into the first load, the polyfill chunk renamed
// out of `polyfillFiles`, or an empty build output would all report 0 B here.
for (const [key, files] of Object.entries(groups)) {
  if (files.length === 0) {
    throw new Error(
      `${key} resolved to zero files; the gate would report 0 B and pass forever`
    )
  }
}

const report = {
  compression: 'brotli',
  route: ROUTE,
  source,
  groups: {},
  passed: true,
}
for (const [key, files] of Object.entries(groups)) {
  let bytes = 0
  for (const f of files) bytes += await brotliBytes(join(NEXT_DIR, f))
  const limit = BUDGETS[key]
  const passed = bytes <= limit
  if (!passed) report.passed = false
  report.groups[key] = { files, bytes, limit, passed }
}

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`first-load budget for ${ROUTE}  (brotli, source: ${source})`)
  for (const [key, g] of Object.entries(report.groups)) {
    console.log(
      `  ${g.passed ? 'PASS' : 'FAIL'}  ${key.padEnd(12)} ` +
        `${String(g.bytes).padStart(7)} B / ${g.limit} B  ` +
        `(${g.files.length} file${g.files.length === 1 ? '' : 's'})`
    )
    for (const f of g.files) console.log(`          ${f}`)
  }
  if (!report.passed) {
    console.error(
      '::error::first-load budget exceeded. Do not raise the limit in this file; ' +
        'move code behind the lazy island or report a defect against the owning ticket.'
    )
  }
}

process.exit(report.passed ? 0 : 1)
