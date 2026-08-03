import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EncodedBundle } from './encode.ts'
import type { EncodeInput } from './encode-types.ts'

const override = vi.hoisted(() => ({
  bundle: undefined as EncodedBundle | undefined,
}))

vi.mock('./encode-bundle.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./encode-bundle.ts')>()
  return {
    ...actual,
    encodeBundle: (input: EncodeInput) =>
      override.bundle ?? actual.encodeBundle(input),
  }
})

// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle, main, writeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { MINI_INPUT, validInput } from './encode-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'

const lastGood = encodeBundle(validInput())

describe('main refusal boundary', () => {
  afterEach(() => {
    override.bundle = undefined
  })

  it.each([
    ['E_EMPTY', () => encodeBundle(MINI_INPUT), 1],
    [
      'E_COLUMNS',
      () => changedChunk('{"b":0,"d":[0],"r":[],"p":[0],"a":[0]}\n'),
      1,
    ],
    [
      'E_DELTA',
      () => changedChunk('{"b":0,"d":[-1],"r":[0],"p":[0],"a":[0]}\n'),
      1,
    ],
    [
      'E_PATH_RANGE',
      () => changedChunk('{"b":0,"d":[0],"r":[0],"p":[999],"a":[0]}\n'),
      1,
    ],
    [
      'E_REPO_RANGE',
      () => changedChunk('{"b":0,"d":[0],"r":[999],"p":[0],"a":[0]}\n'),
      1,
    ],
    ['E_DICT_GUARD', () => changedFile('paths/pd-00.json', hugeJson()), 1],
    ['E_FIRST_BYTE', () => changedFile('repos.json', hugeJson()), 1],
    [
      'E_SAML',
      () => ({
        ...validBundle(),
        samlCanary: { ...MINI_INPUT.samlCanary, ok: false },
      }),
      2,
    ],
  ])('keeps target untouched for %s', async (code, build, exit) => {
    const bundle = build()
    expect(codes(bundle)).toContain(code)
    override.bundle = bundle
    await expect(refusal(exit)).resolves.toBeUndefined()
  })

  it('keeps target untouched for a previous-run regression', async () => {
    const bundle = validBundle()
    const previous = { events: 50_000, combinedTotal: 50_000 }
    expect(codes(bundle, previous)).toContain('E_REGRESSION')
    override.bundle = bundle
    await expect(refusal(1, previous)).resolves.toBeUndefined()
  })
})

function validBundle(): EncodedBundle {
  return encodeBundle(validInput())
}

function changedChunk(text: string): EncodedBundle {
  return changedFile('events/ee-00.json', text)
}

function changedFile(path: string, text: string): EncodedBundle {
  const bundle = validBundle()
  const bytes = Buffer.from(text)
  const manifest = {
    ...bundle.manifest,
    integrity: {
      ...bundle.manifest.integrity,
      [path]: `sha256-${createHash('sha256').update(bytes).digest('hex')}`,
    },
  }
  return {
    ...bundle,
    manifest,
    files: bundle.files.map((file) =>
      file.path === 'manifest.json'
        ? { ...file, bytes: Buffer.from(`${JSON.stringify(manifest)}\n`) }
        : file.path === path
          ? { ...file, bytes }
          : file
    ),
  }
}

function hugeJson(): string {
  return `${JSON.stringify({ from: 0, n: 1, fc: `#${noise(30_000)}` })}\n`
}

function noise(length: number): string {
  let state = 17
  return Array.from({ length }, () => {
    state = (state * 16_807) % 2_147_483_647
    return String.fromCharCode(33 + (state % 90))
  }).join('')
}

async function refusal(
  expected: number,
  previous?: { events: number; combinedTotal: number }
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'kw014-main-'))
  const input = join(directory, 'input.json')
  const output = join(directory, 'bundle')
  const state = join(directory, 'state.json')
  await writeFile(input, JSON.stringify(MINI_INPUT))
  await writeBundle(lastGood, output)
  const before = await tree(output)
  if (previous)
    await writeFile(
      state,
      JSON.stringify({ schema: 1, repos: {}, ...previous })
    )
  await expect(
    main(['--input', input, '--out', output, '--state', state])
  ).resolves.toBe(expected)
  await expect(tree(output)).resolves.toEqual(before)
}

function codes(
  bundle: EncodedBundle,
  previous?: { events: number; combinedTotal: number }
): string[] {
  return validateBundle(
    bundle,
    previous ? { schema: 1, repos: {}, ...previous } : null
  ).findings.map((finding) => finding.code)
}

async function tree(
  directory: string,
  prefix = ''
): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const parts = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      return entry.isDirectory()
        ? tree(join(directory, entry.name), path)
        : { [path]: await readFile(join(directory, entry.name), 'utf8') }
    })
  )
  return Object.assign({}, ...parts)
}
