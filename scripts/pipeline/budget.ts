#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants as zlib } from 'node:zlib'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import * as bundle from '../../lib/bundle/schema.ts'
/** Required resources in their stable first-load request order. */
export const FIRST_BYTE_FILES: readonly string[] = [
  'manifest.json',
  'repos.json',
  'grid.json',
  bundle.chunkFileName(0),
  bundle.dictFileName(0),
]
/** One first-load resource and its independently measured sizes. */
export interface BudgetEntry {
  file: string
  rawBytes: number
  brotliBytes: number
}
/** Complete result of checking a promoted bundle's first-load resources. */
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
interface CliOptions {
  dir?: string
  limitBytes?: number
  mode: 'json' | 'markdown' | 'text'
}
type SizeKey = 'brotliBytes' | 'rawBytes'
/**
 * @description Measures bytes with the parameters used by the first-load budget.
 * @param bytes Resource contents to compress.
 * @returns The deterministic quality-11 Brotli length in bytes.
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
async function readEntry(root: string, file: string) {
  try {
    const bytes = await readFile(path.join(root, file))
    return { file, rawBytes: bytes.length, brotliBytes: brotliSize(bytes) }
  } catch {
    return undefined
  }
}
function total(entries: readonly BudgetEntry[], key: SizeKey): number {
  return entries.reduce((sum, entry) => sum + entry[key], 0)
}
/**
 * @description Independently measures the promoted resources fetched on first load.
 * @param dir Bundle directory, resolved from the current working directory.
 * @param limitBytes Maximum combined Brotli bytes permitted.
 * @returns An ordered report; missing or unreadable files are reported without throwing.
 */
export async function measureFirstByte(
  dir: string = bundle.DATA_ROOT,
  limitBytes: number = bundle.FIRST_BYTE_BROTLI_BUDGET_BYTES
): Promise<BudgetReport> {
  const root = path.resolve(dir)
  const results = await Promise.all(
    FIRST_BYTE_FILES.map((file) => readEntry(root, file))
  )
  const entries = results.filter((entry) => entry !== undefined)
  const missing = FIRST_BYTE_FILES.filter(
    (_, index) => results[index] === undefined
  )
  const totalRawBytes = total(entries, 'rawBytes')
  const totalBrotliBytes = total(entries, 'brotliBytes')
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
function textRow(file: string, rawBytes: number, brotliBytes: number): string {
  return `${file.padEnd(24)} ${String(rawBytes).padStart(5)} ${String(brotliBytes).padStart(7)}`
}
const textEntry = (entry: BudgetEntry): string =>
  textRow(entry.file, entry.rawBytes, entry.brotliBytes)
/**
 * @description Formats a compact aligned table for command-line logs.
 * @param report Measurement to render.
 * @returns Plain text including totals and any missing resources.
 */
export function formatText(report: BudgetReport): string {
  const lines = ['FILE                     RAW  BROTLI']
  lines.push(...report.entries.map(textEntry))
  lines.push(textRow('TOTAL', report.totalRawBytes, report.totalBrotliBytes))
  if (report.missing.length > 0)
    lines.push(`missing: ${report.missing.join(', ')}`)
  return lines.join('\n')
}
/**
 * @description Formats the first-load measurement for a GitHub Actions job summary.
 * @param report Measurement to render.
 * @returns A GitHub-flavored Markdown table plus totals and missing resources.
 */
export function formatMarkdown(report: BudgetReport): string {
  const lines = ['| file | raw B | brotli B |', '|---|---:|---:|']
  lines.push(
    ...report.entries.map(
      (entry) =>
        `| \`${entry.file}\` | ${entry.rawBytes} | ${entry.brotliBytes} |`
    )
  )
  lines.push(
    `| **first byte total** | **${report.totalRawBytes}** | **${report.totalBrotliBytes}** |`
  )
  lines.push(
    '',
    `Limit: ${report.limitBytes} B`,
    `Headroom: ${report.headroomBytes} B`
  )
  if (report.missing.length > 0)
    lines.push(
      `Missing: ${report.missing.map((file) => `\`${file}\``).join(', ')}`
    )
  return lines.join('\n')
}
function argumentValue(argv: readonly string[], index: number): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${argv[index]} requires a value`)
  return value
}
function parseLimit(value: string): number {
  const limit = Number(value)
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new Error(`invalid --limit value: ${value}`)
  return limit
}
function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { mode: 'text' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dir') options.dir = argumentValue(argv, index++)
    else if (arg === '--limit')
      options.limitBytes = parseLimit(argumentValue(argv, index++))
    else if (arg === '--json' && options.mode === 'text') options.mode = 'json'
    else if (arg === '--markdown' && options.mode === 'text')
      options.mode = 'markdown'
    else throw new Error(`invalid argument: ${arg}`)
  }
  return options
}
function formatOutput(report: BudgetReport, mode: CliOptions['mode']): string {
  if (mode === 'json') return JSON.stringify(report)
  if (mode === 'markdown') return formatMarkdown(report)
  return formatText(report)
}
function verdict(report: BudgetReport): string {
  if (report.missing.length > 0)
    return `First-byte budget unavailable: ${report.missing.length} required file(s) missing or unreadable.`
  if (!report.ok)
    return `First-byte budget exceeded by ${-report.headroomBytes} B (${report.totalBrotliBytes} > ${report.limitBytes}).`
  return `First-byte budget passed with ${report.headroomBytes} B headroom (${report.totalBrotliBytes} <= ${report.limitBytes}).`
}
/**
 * @description Runs the budget CLI and writes the selected report before its verdict.
 * @param argv Arguments following the script name.
 * @returns Exit 0 on success, 1 over budget, or 2 for missing files or invalid arguments.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  try {
    const options = parseArgs(argv)
    const report = await measureFirstByte(options.dir, options.limitBytes)
    process.stdout.write(`${formatOutput(report, options.mode)}\n`)
    process.stderr.write(`${verdict(report)}\n`)
    if (report.missing.length > 0) return 2
    return report.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Budget check failed'}\n`
    )
    return 2
  }
}
if (import.meta.url === `file://${process.argv[1]}`)
  process.exitCode = await main()
