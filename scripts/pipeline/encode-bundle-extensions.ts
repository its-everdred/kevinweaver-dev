import type { RawEvent } from './encode-types.ts'

/**
 * @description Derives a canonical capped extension set from measured paths.
 * @param events Repository events with repository-relative paths.
 * @returns Lexically sorted extension names, capped at eight values.
 */
export function extensions(events: readonly RawEvent[]): string[] {
  return [
    ...new Set(events.map((event) => extension(event.path)).filter(Boolean)),
  ]
    .sort()
    .slice(0, 8)
}

function extension(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : ''
}
