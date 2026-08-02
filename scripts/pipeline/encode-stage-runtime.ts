export function requiredToken(): string {
  const token = process.env.CONTRIB_TOKEN
  if (token) return token
  throw new Error('CONTRIB_TOKEN is required for pipeline stages.')
}

export function requiredCommit(): string {
  const commit = process.env.GITHUB_SHA?.slice(0, 7)
  if (commit) return commit
  throw new Error('GITHUB_SHA is required for pipeline stages.')
}

export function currentSecond(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export async function loadStage<T>(
  specifier: string,
  binding: string
): Promise<T> {
  let module: Record<string, unknown>
  try {
    module = await import(specifier)
  } catch {
    throw new UpstreamUnavailableError(specifier)
  }
  const value = module[binding]
  if (typeof value !== 'function')
    throw new UpstreamUnavailableError(`${specifier}#${binding}`)
  return value as T
}

export class UpstreamUnavailableError extends Error {
  constructor(specifier: string) {
    super(`Upstream pipeline input is unavailable: ${specifier}`)
    this.name = 'UpstreamUnavailableError'
  }
}
