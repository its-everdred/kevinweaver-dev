#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants as zlib } from 'node:zlib'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { DATA_ROOT, FIRST_BYTE_BROTLI_BUDGET_BYTES, chunkFileName, dictFileName } from '../../lib/bundle/schema.ts'

/** The exact five-file set a first-time visitor fetches. Order is the report order. */
export const FIRST_BYTE_FILES: readonly string[] = [
  'manifest.json',
  'repos.json',
  'grid.json',
  chunkFileName(0),
  dictFileName(0),
]

/** One measured first-byte resource. `file` is bundle-relative. */
export interface BudgetEntry {
  file: string
  rawBytes: number
  brotliBytes: number
}

/** The outcome of measuring every required first-byte resource. */
export interface BudgetReport {
  ok: boolean
  dir: string
  limitBytes: number
  totalRawBytes: number
  totalBrotliBytes: number
  headroomBytes: number
  entries: readonly BudgetEntry[]
  missing: readonly string[]
}

/**
 * Deterministic brotli size of one resource.
 * Parameters are pinned so two runs never disagree: quality 11, text mode, and
 * a size hint of the input length.
 */
export function brotliSize(bytes: Uint8Array): number {
  return brotliCompressSync(bytes, {
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: 11,
      [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
      [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  }).length
}

/** Reads the five first-byte files, measures them, and reports. Never throws on a missing file. */
export async function measureFirstByte(
  dir: string = DATA_ROOT,
  limitBytes: number = FIRST_BYTE_BROTLI_BUDGET_BYTES
): Promise<BudgetReport> {
  const root = path.resolve(dir)
  const entries: BudgetEntry[] = []
  const missing: string[] = []
  for (const file of FIRST_BYTE_FILES) {
    try {
      const bytes = await readFile(path.join(root, file))
      entries.push({
        file,
        rawBytes: bytes.length,
        brotliBytes: brotliSize(bytes),
      })
    } catch {
      missing.push(file)
    }
  }
  const totalBrotliBytes = entries.reduce((n, e) => n + e.brotliBytes, 0)
  const totalRawBytes = entries.reduce((n, e) => n + e.rawBytes, 0)
  return {
    ok: missing.length === 0 && totalBrotliBytes <= limitBytes,
    dir: root,
    limitBytes,
    totalRawBytes,
    totalBrotliBytes,
    headroomBytes: limitBytes - totalBrotliBytes,
    entries,
    missing,
  }
}

/** Aligned text table for run logs. */
export function formatText(report: BudgetReport): string {
  const width = Math.max(
    ...report.entries.map((entry) => entry.file.length),
    'first byte total'.length
  )
  const pad = (file: string) => file.padEnd(width)
  const rows = report.entries.map(
    (entry) =>
      `${pad(entry.file)}  ${String(entry.rawBytes).padStart(8)}  ${String(
        entry.brotliBytes
      ).padStart(8)}`
  )
  return [
    `dir:   ${report.dir}`,
    `limit: ${report.limitBytes} B`,
    '',
    `${pad('file')}  ${'raw B'.padStart(8)}  ${'brotli B'.padStart(8)}`,
    ...rows,
    `${pad('first byte total')}  ${String(report.totalRawBytes).padStart(8)}  ${String(
      report.totalBrotliBytes
    ).padStart(8)}`,
    `headroom: ${report.headroomBytes} B`,
  ].join('\n')
}

/** GFM table for the job summary. */
export function formatMarkdown(report: BudgetReport): string {
  const rows = report.entries.map(
    (entry) => `| ${entry.file} | ${entry.rawBytes} | ${entry.brotliBytes} |`
  )
  const missing = report.missing.map((file) => `| ${file} | missing | - |`)
  return [
    '| file | raw B | brotli B |',
    '|---|---:|---:|',
    ...rows,
    ...missing,
    `| **first byte total** | **${report.totalRawBytes}** | **${report.totalBrotliBytes}** |`,
    `| **headroom** | | **${report.headroomBytes}** |`,
  ].join('\n')
}

type OutputFormat = 'text' | 'json' | 'markdown'

interface Options {
  dir?: string
  limit?: number
  format: OutputFormat
}

function readOptions(argv: readonly string[]): Options {
  const options: Options = { format: 'text' }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--json') options.format = 'json'
    else if (flag === '--markdown') options.format = 'markdown'
    else if (flag === '--dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--'))
        throw new Error('Missing value for --dir')
      options.dir = value
      index += 1
    } else if (flag === '--limit') {
      const value = argv[index + 1]
      if (!value || !/^\d+$/.test(value))
        throw new Error('Missing numeric value for --limit')
      options.limit = Number(value)
      index += 1
    } else {
      throw new Error(`Unknown option: ${flag}`)
    }
  }
  return options
}

function verdict(report: BudgetReport): string {
  if (report.missing.length > 0)
    return `first byte: missing ${report.missing.join(', ')}`
  if (!report.ok)
    return `first byte: ${report.totalBrotliBytes}/${report.limitBytes} B brotli, over budget by ${-report.headroomBytes} B`
  return `first byte: ${report.totalBrotliBytes}/${report.limitBytes} B brotli, ${report.headroomBytes} B headroom`
}

/**
 * Resolves to the process exit code. Writes the selected output to stdout and a
 * single verdict line to stderr before returning, so the job summary is always
 * populated even when the exit code is non-zero.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  let report: BudgetReport
  try {
    const options = readOptions(argv)
    report = await measureFirstByte(options.dir, options.limit)
    const body =
      options.format === 'json'
        ? JSON.stringify(report)
        : options.format === 'markdown'
          ? formatMarkdown(report)
          : formatText(report)
    console.log(body)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'budget failed')
    return 1
  }
  console.error(verdict(report))
  if (report.missing.length > 0) return 2
  if (!report.ok) return 1
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code
  })
}
