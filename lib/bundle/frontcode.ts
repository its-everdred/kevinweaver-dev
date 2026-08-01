export const FRONTCODE_BASE = 35
export const FRONTCODE_MAX_PREFIX = 90

class FrontCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrontCodeError'
  }
}

/** Encodes one independently decodable path-dictionary slice. */
export function frontCode(paths: readonly string[]): string {
  let previous = ''
  const lines = paths.map((path) => {
    if (path.length === 0 || path.includes('\n')) {
      throw new FrontCodeError('Paths must be non-empty and newline-free.')
    }
    const prefix = commonPrefix(previous, path)
    previous = path
    return String.fromCharCode(FRONTCODE_BASE + prefix) + path.slice(prefix)
  })
  return lines.join('\n')
}

/** Decodes a front-coded dictionary slice without requiring prior-slice state. */
export function frontDecode(encoded: string): string[] {
  if (encoded === '') return []
  let previous = ''
  return encoded.split('\n').map((line) => {
    const prefix = line.charCodeAt(0) - FRONTCODE_BASE
    if (prefix < 0 || prefix > FRONTCODE_MAX_PREFIX || line.length === 0) {
      throw new FrontCodeError('Invalid front-coded path marker.')
    }
    if (prefix > previous.length) {
      throw new FrontCodeError('Invalid front-coded path prefix.')
    }
    const path = previous.slice(0, prefix) + line.slice(1)
    if (path.length === 0)
      throw new FrontCodeError('Invalid empty decoded path.')
    previous = path
    return path
  })
}

function commonPrefix(left: string, right: string): number {
  const length = Math.min(left.length, right.length, FRONTCODE_MAX_PREFIX)
  let index = 0
  while (index < length && left[index] === right[index]) index += 1
  return index
}
