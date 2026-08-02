import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle, main } from './encode.ts'
import type { EncodeInput } from './encode.ts'

export const MINI_INPUT: EncodeInput = {
  events: [
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'a'.repeat(40),
      path: 'packages/engine/src/run.ts',
      actor: 0,
    },
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'b'.repeat(40),
      path: 'packages/engine/src/bootstrap.ts',
      actor: 1,
    },
    {
      day: '2026-07-30',
      repo: 'ethereum-optimism/actions',
      sha: 'c'.repeat(40),
      path: 'apps/web/app/page.tsx',
      actor: 0,
    },
  ],
  repos: [
    {
      n: 'aiur-team/aiur',
      first: '2026-07-30',
      last: '2026-07-31',
      private: false,
      status: 'ok',
    },
    {
      n: 'ethereum-optimism/actions',
      first: '2026-07-30',
      last: '2026-07-30',
      private: false,
      status: 'ok',
    },
  ],
  grid: {
    start: '2026-07-30',
    e: [1, 2],
    a: [0, 1],
    p: [0],
    bands: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  combinedTotal: 4,
  generatedAt: '2026-07-31T00:00:00Z',
  commit: 'abcdef0',
  repoCount: 2,
  repoCountDefinition: 'ownerPublicNonFork',
  refs: 'all',
  chunkSize: 3,
  dictSliceGuardGzipBytes: 12_288,
  samlCanary: {
    ok: true,
    org: 'ethereum-optimism',
    checkedAt: '2026-07-31T00:00:00Z',
  },
  degraded: [],
}

describe('pipeline encoder', () => {
  it('emits deterministic Scheme D files from unordered events', () => {
    const first = encodeBundle(MINI_INPUT)
    const second = encodeBundle({
      ...MINI_INPUT,
      events: [...MINI_INPUT.events].reverse(),
    })

    expect(first.files).toEqual(second.files)
    expect(first.manifest).toMatchObject({
      generatedAt: MINI_INPUT.generatedAt,
      windowStart: '2026-07-30',
      windowEnd: '2026-07-31',
      dayCount: 2,
    })
    expect(text(first, 'events/ee-00.json')).toBe(
      '{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[0,1,0]}\n'
    )
  })

  it('refuses invalid input without replacing a prior public bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    const output = join(directory, 'bundle')
    await writeFile(input, JSON.stringify(MINI_INPUT))
    await writeFile(output, 'previous bundle')

    const code = await main([
      '--input',
      input,
      '--out',
      output,
      '--state',
      join(directory, 'state.json'),
    ])

    expect(code).toBe(1)
    await expect(readFile(output, 'utf8')).resolves.toBe('previous bundle')
  })

  it('returns the SAML refusal code for a degraded calendar', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    await writeFile(
      input,
      JSON.stringify({ ...MINI_INPUT, degraded: ['calendar'] })
    )

    await expect(main(['--input', input, '--dry-run'])).resolves.toBe(2)
  })
})

function text(bundle: ReturnType<typeof encodeBundle>, path: string): string {
  const file = bundle.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing ${path}`)
  return new TextDecoder().decode(file.bytes)
}
