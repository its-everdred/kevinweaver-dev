import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { EncodeInput } from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { resolveStages } from './encode-stages.ts'

const schema = z.object({
  events: z.array(
    z.object({
      day: z.string(),
      repo: z.string(),
      sha: z.string(),
      path: z.string(),
      actor: z.union([z.literal(0), z.literal(1)]),
    })
  ),
  repos: z.array(
    z.object({
      n: z.string(),
      databaseId: z.number().int().positive(),
      stargazerCount: z.number().int().nonnegative(),
      first: z.string().optional(),
      last: z.string().optional(),
      private: z.boolean(),
      status: z.enum(['ok', 'stale', 'gone']),
    })
  ),
  grid: z.object({
    start: z.string(),
    e: z.array(z.number().int().nonnegative()).min(1),
    a: z.array(z.number().int().nonnegative()),
    p: z.array(z.number().int().nonnegative()),
    bands: z.array(z.number().int().nonnegative()),
  }),
  combinedTotal: z.number().int().nonnegative(),
  generatedAt: z.string(),
  commit: z.string(),
  repoCount: z.number().int().nonnegative(),
  repoCountDefinition: z.enum([
    'publicRepos',
    'ownerPublic',
    'ownerPublicNonFork',
    'withMemberAffiliations',
    'repositoriesContributedTo',
  ]),
  refs: z.enum(['all', 'head']),
  chunkSize: z.literal(1500),
  dictSliceGuardGzipBytes: z.number().int().nonnegative(),
  samlCanary: z.object({
    ok: z.boolean(),
    org: z.string(),
    checkedAt: z.string(),
  }),
  degraded: z.array(z.enum(['calendar', 'private', 'events'])),
})
export type Options = {
  input?: string
  out?: string
  state?: string
  generatedAt?: string
  dryRun: boolean
}
export function readOptions(argv: readonly string[]): Options {
  const options: Options = { dryRun: argv.includes('--dry-run') }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--dry-run') continue
    if (!['--input', '--out', '--state', '--generated-at'].includes(flag ?? ''))
      throw new Error(`Unknown option: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`)
    if (flag === '--input') options.input = value
    if (flag === '--out') options.out = value
    if (flag === '--state') options.state = value
    if (flag === '--generated-at') options.generatedAt = value
    index += 1
  }
  return options
}
export async function resolveInput(
  path: string | undefined
): Promise<EncodeInput> {
  if (!path) {
    return resolveStages()
  }
  const parsed = schema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success)
    throw new Error(`Invalid --input: ${parsed.error.message}`)
  return parsed.data
}
