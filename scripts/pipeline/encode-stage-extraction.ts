import type { ExtractResult } from './extract.ts'

/** Narrows the complete dynamic extraction result at its process boundary. */
export function extractionLike(value: unknown): value is ExtractResult {
  return (
    record(value) &&
    string(value.cloneRoot) &&
    value.commitScope === '--all' &&
    array(value.events, event) &&
    array(value.repos, repository)
  )
}

function repository(value: unknown): boolean {
  return (
    record(value) &&
    string(value.n) &&
    string(value.first) &&
    string(value.last) &&
    value.private === false &&
    status(value.status) &&
    integer(value.consecutiveFailures) &&
    nullableString(value.lastOk) &&
    stringRecord(value.heads) &&
    array(value.events, event) &&
    nullableString(value.error)
  )
}

function event(value: unknown): boolean {
  return (
    record(value) &&
    string(value.day) &&
    string(value.repo) &&
    string(value.sha) &&
    string(value.path) &&
    (value.actor === 0 || value.actor === 1) &&
    string(value.authorDate)
  )
}

function status(value: unknown): boolean {
  return value === 'ok' || value === 'stale' || value === 'gone'
}

function nullableString(value: unknown): boolean {
  return value === null || string(value)
}

function stringRecord(value: unknown): boolean {
  return record(value) && Object.values(value).every(string)
}

function array(value: unknown, check: (value: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): value is string {
  return typeof value === 'string'
}

function integer(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
