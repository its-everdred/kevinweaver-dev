import { createGraphLayer } from './render/graph'
import { createOverviewLayer } from './render/overview'
import { createRibbonLayer } from './render/ribbon'
import {
  createFrameBudget,
  type GridSeries,
  type Quality,
} from './render/budget'
import type { VizQuality } from './driver'
import type { VizSurfaceRenderLayers } from './surface-painter'
import type { RenderMeta } from './render/budget'
import type { SimInput } from './sim/types'

/**
 * @description Payload-derived contribution series and display metadata for one driver.
 */
export interface VizDriverRenderData {
  readonly grid: GridSeries
  readonly meta: RenderMeta
}

/**
 * @description Creates renderer layers owned by one deterministic visualization driver.
 * @param input - Simulation dimensions used to size renderer-owned data structures.
 * @param data - Contribution series and display metadata supplied by the payload adapter.
 * @returns The graph, ribbon, overview, and budget layers for one driver.
 * @throws {RangeError} When renderer data does not match the simulation dimensions.
 */
export function createVizDriverRenderLayers(
  input: SimInput,
  data: VizDriverRenderData
): VizSurfaceRenderLayers {
  validateRenderData(input, data)
  return {
    budget: createFrameBudget(false),
    graph: createGraphLayer(input.entityCount),
    ribbon: createRibbonLayer(data.grid),
    overview: createOverviewLayer(data.grid),
  }
}

/**
 * @description Converts the driver's quality policy into renderer configuration.
 * @param value - Driver quality tier and rendering capability flags.
 * @returns Renderer configuration matching the supplied policy.
 */
export function renderVizQuality(value: VizQuality): Quality {
  return {
    name: renderQualityName(value.tier),
    dpr: value.dprCap,
    fileLabels: value.fileLabels,
    spokes: value.spokes,
    shadows: value.glow,
    maxFiles: value.fileCap,
    clusterMode: value.tier < 4 ? 'blur' : 'hatch',
  }
}

function validateRenderData(input: SimInput, data: VizDriverRenderData): void {
  const { grid, meta } = data
  if (grid.dayCount !== input.dayCount)
    throw new RangeError('render grid dayCount does not match simulation input')
  if (grid.windowStartISO !== input.windowStartISO)
    throw new RangeError('render grid start does not match simulation input')
  if (
    grid.total.length !== input.dayCount ||
    grid.agent.length !== input.dayCount ||
    grid.level.length !== input.dayCount
  )
    throw new RangeError('render grid series lengths do not match dayCount')
  if (meta.repos.length !== input.repoCount)
    throw new RangeError('render metadata does not match repository count')
  if (
    !Number.isInteger(grid.agentBirthDay) ||
    grid.agentBirthDay < -1 ||
    grid.agentBirthDay >= grid.dayCount
  )
    throw new RangeError('render birth day is outside the contribution window')
  if (
    meta.agentBirthDay !== undefined &&
    meta.agentBirthDay !== grid.agentBirthDay
  )
    throw new RangeError('render birth days do not match')
}

function renderQualityName(tier: VizQuality['tier']): Quality['name'] {
  if (tier === 0) return 'full'
  if (tier === 1) return 'no-file-labels'
  if (tier === 2) return 'no-spokes'
  if (tier === 3) return 'no-shadows'
  return tier === 4 ? 'dpr1' : 'half-files'
}
