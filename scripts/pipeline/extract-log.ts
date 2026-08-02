import { spawn } from 'node:child_process'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { actorId, classify } from './identity.ts'
import type { ExtractedEvent } from './extract.ts'

type LogRecord = {
  sha: string
  authorDate: string
  authorEmail: string
  paths: string[]
}

/** Reports an unavailable or malformed preserved git history. */
export class GitLogError extends Error {
  constructor(repo: string, message: string) {
    super(`Could not extract ${repo}: ${message}`)
    this.name = 'GitLogError'
  }
}

/** Reads attributed file touches from an existing bare clone. */
export async function extractRepo(
  repo: string,
  directory: string
): Promise<ExtractedEvent[]> {
  return new Promise((resolve, reject) =>
    readLog(repo, directory, resolve, reject)
  )
}

function readLog(
  repo: string,
  directory: string,
  resolve: (events: ExtractedEvent[]) => void,
  reject: (error: Error) => void
): void {
  const child = spawn('git', gitLogArgs(directory), { env: childEnvironment() })
  const state = logState(repo)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => consumeChunk(state, chunk))
  child.stderr.on('data', (chunk: Buffer) => (state.stderr += chunk.toString()))
  child.on('error', (error) => reject(new GitLogError(repo, error.message)))
  child.on('close', (code) => finishLog(state, code, resolve, reject))
}

function gitLogArgs(directory: string): string[] {
  return [
    '-C',
    directory,
    '-c',
    'core.quotePath=false',
    'log',
    '--all',
    '--no-merges',
    '--no-renames',
    '--no-mailmap',
    '--name-only',
    '--pretty=format:%x01%H%x1f%aI%x1f%ae',
  ]
}

type LogState = {
  repo: string
  events: ExtractedEvent[]
  record?: LogRecord
  remaining: string
  stderr: string
}

function logState(repo: string): LogState {
  return { repo, events: [], remaining: '', stderr: '' }
}

function consumeChunk(state: LogState, chunk: string): void {
  const lines = `${state.remaining}${chunk}`.split('\n')
  state.remaining = lines.pop() ?? ''
  lines.forEach((line) => consumeLine(state, line))
}

function consumeLine(state: LogState, line: string): void {
  if (line.startsWith('\x01')) {
    flush(state)
    state.record = recordFrom(line)
  } else if (line !== '' && state.record) state.record.paths.push(line)
}

function finishLog(
  state: LogState,
  code: number | null,
  resolve: (events: ExtractedEvent[]) => void,
  reject: (error: Error) => void
): void {
  if (state.remaining) consumeLine(state, state.remaining)
  flush(state)
  if (code === 0) return resolve(state.events)
  reject(
    new GitLogError(
      state.repo,
      state.stderr.trim().split('\n').filter(Boolean).at(-1) ?? 'git log failed'
    )
  )
}

function flush(state: LogState): void {
  state.record?.paths.forEach((path) => addEvent(state, path))
}

function addEvent(state: LogState, path: string): void {
  const record = state.record
  if (!record) return
  const login = classify(record.authorEmail)
  if (login === null) return
  state.events.push({
    day: record.authorDate.slice(0, 10),
    repo: state.repo,
    sha: record.sha,
    path: unquotePath(path),
    actor: actorId(login),
    authorDate: record.authorDate,
  })
}

function recordFrom(line: string): LogRecord {
  const [sha, authorDate, authorEmail, ...rest] = line.slice(1).split('\x1f')
  if (!sha || !authorDate || !authorEmail || rest.length > 0)
    throw new GitLogError('unknown', 'malformed log header')
  return { sha, authorDate, authorEmail, paths: [] }
}

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  return path
    .slice(1, -1)
    .replace(/\\([\\"abfnrtv]|[0-7]{3})/g, (_, escape: string) =>
      decodeEscape(escape)
    )
}

function decodeEscape(escape: string): string {
  if (/^[0-7]{3}$/.test(escape))
    return String.fromCharCode(Number.parseInt(escape, 8))
  return (
    { a: '\u0007', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }[
      escape
    ] ?? escape
  )
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.GITHUB_TOKEN
  delete environment.GH_TOKEN
  delete environment.CONTRIB_TOKEN
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
  }
}
