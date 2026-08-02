import type { CalendarBundle, GraphqlRequest } from './calendar.ts'
import type { DiscoveryResult } from './discover.ts'
import type { ExtractResult } from './extract.ts'
import type { PrivateAggregate } from './private.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractionLike } from './encode-stage-extraction.ts'

/** Narrows dynamic stage values at the runtime boundary. */
export function clientValue(value: unknown): GraphqlRequest {
  if (graphqlClient(value)) return value
  throw new StageDataError('Calendar client binding is invalid.')
}

function graphqlClient(value: unknown): value is GraphqlRequest {
  return typeof value === 'function'
}

export function calendarValue(value: unknown): CalendarBundle {
  if (calendarLike(value)) return value
  throw new StageDataError('Calendar stage returned invalid data.')
}

export function privateValue(value: unknown): PrivateAggregate {
  if (privateLike(value)) return value
  throw new StageDataError('Private stage returned invalid data.')
}

export function discoveryValue(value: unknown): DiscoveryResult {
  if (discoveryLike(value)) return value
  throw new StageDataError('Discovery stage returned invalid data.')
}

export function extractionValue(value: unknown): ExtractResult {
  if (extractionLike(value)) return value
  throw new StageDataError('Extraction stage returned invalid data.')
}

function calendarLike(value: unknown): value is CalendarBundle {
  return (
    record(value) &&
    string(value.windowStart) &&
    string(value.windowEnd) &&
    record(value.canary) &&
    boolean(value.canary.ok) &&
    string(value.canary.checkedAt) &&
    days(value.combined) &&
    strings(value.degraded)
  )
}

function privateLike(value: unknown): value is PrivateAggregate {
  return record(value) && numbers(value.p) && strings(value.degraded)
}

function discoveryLike(value: unknown): value is DiscoveryResult {
  return (
    record(value) &&
    Array.isArray(value.repos) &&
    value.repos.every(repository) &&
    record(value.repoCountDefinition) &&
    number(value.repoCountDefinition.count) &&
    string(value.repoCountDefinition.definition)
  )
}

function repository(value: unknown): boolean {
  return (
    record(value) &&
    string(value.nameWithOwner) &&
    number(value.databaseId) &&
    number(value.stargazerCount) &&
    boolean(value.isPrivate)
  )
}

function days(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (day) => record(day) && string(day.date) && number(day.e) && number(day.a)
    )
  )
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): value is string {
  return typeof value === 'string'
}

function boolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function numbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(number)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(string)
}

/**
 * @description Signals malformed or empty data returned by a local stage.
 */
export class StageDataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'StageDataError'
  }
}
