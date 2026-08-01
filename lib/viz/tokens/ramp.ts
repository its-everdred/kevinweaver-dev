import type { Level } from './level'

/** The surface every grid cell is painted on. */
export const PANE_SURFACE = '#1d2021' as const

/** Combined human and agent contribution ramp, indexed by level. */
export const LV = [
  '#3c3836', '#404a2b', '#4d5b21', '#5e6a1f', '#70791d',
  '#83881b', '#98971a', '#b8bb26', '#d9d34a', '#faeb77',
] as const

/** Animation-only companion ramp for agent actor tokens. */
export const AG = [
  '#3c3836', '#5a3b43', '#764251', '#8b4c5f', '#a1586d',
  '#b6637c', '#cc708b', '#f98cac', '#ffa6c6', '#ffc5e1',
] as const

/** Highest agent ramp index that may carry magnitude. */
export const AG_SEMANTIC_MAX = 6 as const

/** Returns the grid fill for a contribution level. */
export function rampColor(value: Level): string {
  return LV[value]
}

/** Returns the capped actor-token fill for a contribution level. */
export function agentColor(value: Level): string {
  return AG[Math.min(value, AG_SEMANTIC_MAX) as Level]
}
