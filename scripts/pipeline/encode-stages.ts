import type { EncodeInput } from './encode-types.ts'
import type { CalendarBundle, GraphqlRequest } from './calendar.ts'
import type { DiscoveryResult } from './discover.ts'
import type { ExtractResult } from './extract.ts'
import type { PrivateAggregate } from './private.ts'
import type { PipelineState } from './state.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { EmptyPipelineDataError, loadStage, PipelineAvailabilityError, requiredToken, UpstreamUnavailableError } from './encode-stage-runtime.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { calendarFromGrid, extractionNames, extractionPriors, privateFromGrid, readPriorGrid } from './encode-stage-prior.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import * as stageAdapters from './encode-stage-adapters.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { assembleInput } from './encode-stage-input.ts'

type Client = GraphqlRequest
type Calendar = CalendarBundle
type Private = Pick<PrivateAggregate, 'p' | 'degraded'>
type Discovery = DiscoveryResult
type Extraction = ExtractResult

/** Loads each live stage and turns it into a bundle-ready input. */
export async function resolveStages(
  previous: PipelineState | null,
  output: string | undefined
): Promise<EncodeInput> {
  const fallback = await readPriorGrid(output, previous)
  const client = await clientFor(requiredToken())
  const calendar = await calendarFor(client, fallback)
  const privateAggregate = await privateFor(
    client,
    calendar.windowStart,
    fallback
  )
  const discovery = await discoveryFor(client, calendar)
  const extraction = await extractionFor(discovery, previous)
  return assembleInput(
    calendar,
    privateAggregate,
    discovery,
    extraction,
    previous
  )
}

async function clientFor(token: string): Promise<Client> {
  const create = await loadStage('./calendar.ts', 'createContribClient')
  return stageAdapters.clientValue(create(token))
}

async function calendarFor(
  client: Client,
  fallback: Awaited<ReturnType<typeof readPriorGrid>>
): Promise<Calendar> {
  const fetch = await loadStage('./calendar.ts', 'fetchCalendarBundle')
  try {
    return stageAdapters.calendarValue(
      await fetch(client, { previous: fallback && calendarFromGrid(fallback) })
    )
  } catch (error) {
    const refusal = await samlRefusal(error)
    if (refusal) throw calendarRefusal(refusal)
    if (error instanceof stageAdapters.StageDataError) throw error
    if (fallback) return calendarFromGrid(fallback)
    throw stageFailure('calendar', error)
  }
}

async function privateFor(
  client: Client,
  start: string,
  fallback: Awaited<ReturnType<typeof readPriorGrid>>
): Promise<Private> {
  const fetch = await loadStage('./private.ts', 'fetchPrivateAggregate')
  try {
    return stageAdapters.privateValue(
      await fetch(client, { pStart: start.slice(0, 7) })
    )
  } catch (error) {
    const refusal = await samlRefusal(error)
    if (refusal) throw calendarRefusal(refusal)
    if (error instanceof stageAdapters.StageDataError) throw error
    if (fallback) return privateFromGrid(fallback)
    throw stageFailure('private', error)
  }
}

async function discoveryFor(
  client: Client,
  calendar: Calendar
): Promise<Discovery> {
  const discover = await loadStage('./discover.ts', 'discoverRepos')
  try {
    return stageAdapters.discoveryValue(
      await discover(client, {
        logins: ['its-everdred', 'its-applekid'],
        fromYear: year(calendar.windowStart),
        toYear: year(calendar.windowEnd),
      })
    )
  } catch (error) {
    throw stageFailure('discovery', error)
  }
}

async function extractionFor(
  discovery: Discovery,
  previous: PipelineState | null
): Promise<Extraction> {
  const extract = await loadStage('./extract.ts', 'extractAll')
  try {
    return stageAdapters.extractionValue(
      await extract(
        extractionNames(
          discovery.repos.map((repo) => repo.nameWithOwner),
          previous
        ),
        extractionPriors(previous)
      )
    )
  } catch (error) {
    throw stageFailure('extraction', error)
  }
}

function stageFailure(stage: string, error: unknown): Error {
  if (
    error instanceof UpstreamUnavailableError ||
    error instanceof stageAdapters.StageDataError
  )
    return error
  if (error instanceof EmptyPipelineDataError)
    return new stageAdapters.StageDataError(
      `E_EMPTY: ${stage} returned no attributable data.`,
      error
    )
  return new UpstreamUnavailableError(`${stage} stage failed`, error)
}

type SamlRefusal = Error & { canary: CalendarBundle['canary'] }

async function samlRefusal(error: unknown): Promise<SamlRefusal | undefined> {
  const constructor = await loadStage('./calendar.ts', 'SamlCanaryError')
  return error instanceof constructor && hasCanary(error) ? error : undefined
}

function hasCanary(error: unknown): error is SamlRefusal {
  return error instanceof Error && 'canary' in error
}

function calendarRefusal(error: SamlRefusal): PipelineAvailabilityError {
  return new PipelineAvailabilityError(
    'SAML canary refused the calendar.',
    error
  )
}

function year(day: string): number {
  return Number(day.slice(0, 4))
}
