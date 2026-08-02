/**
 * @description Reads the credential required by live contribution stages.
 * @returns Non-empty contribution token.
 * @throws {PipelineConfigurationError} When the token is absent.
 */
export function requiredToken(): string {
  const token = process.env.CONTRIB_TOKEN
  if (token) return token
  throw new PipelineConfigurationError(
    'CONTRIB_TOKEN is required for pipeline stages.'
  )
}

/**
 * @description Reads the revision identifier stamped into a live bundle.
 * @returns Seven-character revision identifier.
 * @throws {PipelineConfigurationError} When the revision is absent.
 */
export function requiredCommit(): string {
  const commit = process.env.GITHUB_SHA?.slice(0, 7)
  if (commit) return commit
  throw new PipelineConfigurationError(
    'GITHUB_SHA is required for pipeline stages.'
  )
}

/**
 * @description Produces the sole time-varying bundle value at second precision.
 * @returns RFC3339 timestamp without milliseconds.
 */
export function currentSecond(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * @description Runtime shape accepted for dynamically loaded stage bindings.
 */
export type StageFunction = (...args: readonly unknown[]) => unknown

/**
 * @description Loads a known local stage and verifies its declared binding.
 * @param specifier Local module specifier.
 * @param binding Required function export.
 * @returns Callable stage binding.
 * @throws {UpstreamUnavailableError} When the stage cannot be loaded or bound.
 */
export async function loadStage(
  specifier: string,
  binding: string
): Promise<StageFunction> {
  let stage: Record<string, unknown>
  try {
    stage = await import(specifier)
  } catch (error) {
    throw new UpstreamUnavailableError(specifier, error)
  }
  const value = stage[binding]
  if (!isStageFunction(value))
    throw new UpstreamUnavailableError(`${specifier}#${binding}`)
  return value
}

function isStageFunction(value: unknown): value is StageFunction {
  return typeof value === 'function'
}

/**
 * @description Signals that a required remote input could not be refreshed.
 */
export class UpstreamUnavailableError extends Error {
  constructor(specifier: string, cause?: unknown) {
    super(`Upstream pipeline input is unavailable: ${specifier}`, { cause })
    this.name = 'UpstreamUnavailableError'
  }
}

/**
 * @description Signals a missing local pipeline setting or credential.
 */
export class PipelineConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineConfigurationError'
  }
}

/**
 * @description Signals an authorization refusal that must block publication.
 */
export class PipelineAvailabilityError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'PipelineAvailabilityError'
  }
}

/**
 * @description Signals that a successful local stage produced no usable data.
 */
export class EmptyPipelineDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyPipelineDataError'
  }
}
