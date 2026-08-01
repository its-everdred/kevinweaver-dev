/**
 * A single recorded interaction with a 2D context: either `[methodName, ...args]`
 * for a method call, or `['set:<prop>', value]` for a property write.
 */
export type Call = [string, ...unknown[]]

/**
 * A recording session: a transparent proxy over a real context plus the live
 * array of calls made through it.
 */
export interface Recording {
  /** Transparent proxy. Forwards to the real context, so pixels stay real. */
  ctx: CanvasRenderingContext2D
  /** Appended to in call order. Same array instance for the session's life. */
  calls: Call[]
}

/** Snapshots must not diff on floating-point noise, so numbers land at 3 dp. */
const round = (v: unknown): unknown =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v

/**
 * @description Wraps a real 2D context so every method call and property write
 * is appended to a call log, while still forwarding to the underlying context.
 * Recorded finite numbers are rounded to 3 decimal places so a snapshot is
 * stable across machines and a colour change reads as a one-line text diff.
 * Symbol keys pass through unrecorded.
 * @param target the real context to wrap; it is mutated as normal by the proxy
 * @returns the proxy to draw through and the array its calls accumulate in
 * @see {@link drawCallsUnderFilter}
 */
export function recordContext(target: CanvasRenderingContext2D): Recording {
  const calls: Call[] = []
  const proxy = new Proxy(target, {
    get(t, key) {
      // Receiver is the target, not the proxy: native accessors such as
      // fillStyle throw on a proxy receiver.
      const value = Reflect.get(t, key, t) as unknown
      if (typeof key === 'symbol') return value
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push([key, ...args.map(round)])
          return (value as (...a: unknown[]) => unknown).apply(t, args)
        }
      }
      return value
    },
    set(t, key, value) {
      if (typeof key !== 'symbol') calls.push([`set:${key}`, round(value)])
      Reflect.set(t, key, value, t)
      return true
    },
  })
  return { ctx: proxy, calls }
}

const DRAW_CALLS = new Set([
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
])

/**
 * @description Counts the draw calls issued while `ctx.filter` was set to
 * something other than `''` or `'none'`. Canvas filters are the most expensive
 * primitive in the 2D API, so the renderer budgets at most one draw under one.
 * @param calls a recording produced by {@link recordContext}
 * @returns how many draw calls ran with an active filter
 */
export function drawCallsUnderFilter(calls: readonly Call[]): number {
  let filterOn = false
  let count = 0
  for (const [name, ...args] of calls) {
    if (name === 'set:filter') {
      const value = args[0]
      filterOn = typeof value === 'string' && value !== '' && value !== 'none'
      continue
    }
    if (filterOn && DRAW_CALLS.has(name)) count += 1
  }
  return count
}
