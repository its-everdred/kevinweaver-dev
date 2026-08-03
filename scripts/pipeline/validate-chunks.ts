import type { ChunkColumns, Finding } from './validate-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add, sum } from './validate-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readChunk, readSlice } from './validate-format.ts'

export function validateColumns(
  chunks: readonly string[],
  slices: readonly string[],
  repoCount: number,
  findings: Finding[]
): void {
  let dictionaryLength = 0
  let previousLast = -1
  chunks.forEach((text, index) => {
    const resources = chunkResources(text, slices[index] ?? '', index, findings)
    if (!resources) return
    dictionaryLength += resources.paths
    validateChunk(
      resources.chunk,
      index,
      dictionaryLength,
      repoCount,
      previousLast,
      findings
    )
    previousLast = resources.chunk.b + sum(resources.chunk.d)
  })
}

function chunkResources(
  chunkText: string,
  sliceText: string,
  index: number,
  findings: Finding[]
): { chunk: ChunkColumns; paths: number } | undefined {
  const chunk = readChunk(chunkText)
  const slice = readSlice(sliceText)
  if (chunk && slice) return { chunk, paths: slice.paths.length }
  add(findings, 'E_JSON', `Invalid resource at chunk ${index}.`)
  return undefined
}

function validateChunk(
  chunk: ChunkColumns,
  index: number,
  dictionaryLength: number,
  repoCount: number,
  previousLast: number,
  findings: Finding[]
): void {
  validateColumnLengths(chunk, index, findings)
  validateDeltas(chunk, index, findings)
  validateFirstDay(chunk, index, findings)
  validatePathRange(chunk, index, dictionaryLength, findings)
  validateRepositoryRange(chunk, index, repoCount, findings)
  validateChunkBase(chunk, index, previousLast, findings)
}

function validateColumnLengths(
  chunk: ChunkColumns,
  index: number,
  findings: Finding[]
): void {
  if (
    chunk.d.length === chunk.r.length &&
    chunk.d.length === chunk.p.length &&
    chunk.d.length === chunk.a.length
  )
    return
  add(findings, 'E_COLUMNS', `Chunk ${index} columns differ in length.`)
}

function validateDeltas(
  chunk: ChunkColumns,
  index: number,
  findings: Finding[]
): void {
  if (chunk.d.every((value) => value >= 0)) return
  add(findings, 'E_DELTA', `Chunk ${index} has a negative day delta.`)
}

function validateFirstDay(
  chunk: ChunkColumns,
  index: number,
  findings: Finding[]
): void {
  if (chunk.d.length === 0 || chunk.d[0] === 0) return
  add(findings, 'E_CHUNK_BASE', `Chunk ${index} base is not its first day.`)
}

function validatePathRange(
  chunk: ChunkColumns,
  index: number,
  dictionaryLength: number,
  findings: Finding[]
): void {
  if (chunk.p.every((value) => value >= 0 && value < dictionaryLength)) return
  add(
    findings,
    'E_PATH_RANGE',
    `Chunk ${index} references an unavailable path.`
  )
}

function validateRepositoryRange(
  chunk: ChunkColumns,
  index: number,
  repoCount: number,
  findings: Finding[]
): void {
  const reposValid = chunk.r.every((value) => value >= 0 && value < repoCount)
  if (reposValid && chunk.a.every((value) => value === 0 || value === 1)) return
  add(
    findings,
    'E_REPO_RANGE',
    `Chunk ${index} has an invalid repository or actor.`
  )
}

function validateChunkBase(
  chunk: ChunkColumns,
  index: number,
  previousLast: number,
  findings: Finding[]
): void {
  if (chunk.b >= previousLast) return
  add(findings, 'E_CHUNK_BASE', `Chunk ${index} is not monotonic.`)
}
