import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle, main } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { MINI_INPUT, validInput } from './encode-fixture.ts'

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
      days: ['2026-07-31', '2026-07-30'],
      windowStart: '2026-07-28',
      windowEnd: '2026-08-01',
      dayCount: 5,
    })
    expect(text(first, 'events/ee-00.json')).toBe(
      '{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[0,1,0]}\n'
    )
    expect(text(first, 'manifest.json')).not.toContain('integrity')
    expect(JSON.parse(text(first, 'integrity.json'))['repos.json']).toMatch(
      /^sha256-/
    )
    expect(JSON.parse(text(first, 'repos.json'))).toEqual([
      expect.objectContaining({ a: 0, g: 1, s: 10, x: ['ts'] }),
      expect.objectContaining({ a: 0, g: 2, s: 20, x: ['tsx'] }),
    ])
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

  it('rejects an input without discovery metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    await writeFile(
      input,
      JSON.stringify(MINI_INPUT).replace('"databaseId":1,', '')
    )

    await expect(main(['--input', input, '--dry-run'])).resolves.toBe(1)
  })

  it('rejects a non-positive discovery database ID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    await writeFile(
      input,
      JSON.stringify(MINI_INPUT).replace('"databaseId":1,', '"databaseId":0,')
    )

    await expect(main(['--input', input, '--dry-run'])).resolves.toBe(1)
  })

  it('preserves validated heads supplied through the input boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    const output = join(directory, 'bundle')
    const state = join(directory, 'state.json')
    const heads = { 'refs/heads/main': 'a'.repeat(40) }
    const fixture = validInput()
    await writeFile(
      input,
      JSON.stringify({
        ...fixture,
        repos: [{ ...fixture.repos[0]!, heads }, ...fixture.repos.slice(1)],
      })
    )

    await expect(
      main(['--input', input, '--out', output, '--state', state])
    ).resolves.toBe(0)
    await expect(readFile(state, 'utf8')).resolves.toContain(
      '"refs/heads/main"'
    )
  })

  it('promotes a valid bundle and advances its state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-encode-'))
    const input = join(directory, 'input.json')
    const output = join(directory, 'bundle')
    const state = join(directory, 'state.json')
    await writeFile(input, JSON.stringify(validInput()))

    await expect(
      main([
        '--input',
        input,
        '--out',
        output,
        '--state',
        state,
        '--generated-at',
        '2026-07-31T00:00:00Z',
      ])
    ).resolves.toBe(0)

    await expect(
      readFile(join(output, 'manifest.json'), 'utf8')
    ).resolves.toContain('generatedAt')
    await expect(readFile(state, 'utf8')).resolves.toContain('bundleHash')
  })

  it('leaves an existing target untouched for every fixture refusal', async () => {
    const cases = [
      {
        input: {
          ...MINI_INPUT,
          samlCanary: { ...MINI_INPUT.samlCanary, ok: false },
        },
        code: 2,
      },
      { input: { ...MINI_INPUT, degraded: ['calendar'] as const }, code: 2 },
      {
        input: { ...MINI_INPUT, grid: { ...MINI_INPUT.grid, a: [] } },
        code: 1,
      },
      { input: { ...MINI_INPUT, chunkSize: 1_499 }, code: 1 },
      { input: { ...MINI_INPUT, dictSliceGuardGzipBytes: 0 }, code: 1 },
    ]
    for (const fixture of cases) {
      const directory = await mkdtemp(join(tmpdir(), 'kw014-refusal-'))
      const input = join(directory, 'input.json')
      const output = join(directory, 'bundle')
      await writeFile(input, JSON.stringify(fixture.input))
      await writeFile(output, 'last good bundle')

      await expect(main(['--input', input, '--out', output])).resolves.toBe(
        fixture.code
      )
      await expect(readFile(output, 'utf8')).resolves.toBe('last good bundle')
    }
  })
})

function text(bundle: ReturnType<typeof encodeBundle>, path: string): string {
  const file = bundle.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing ${path}`)
  return new TextDecoder().decode(file.bytes)
}
