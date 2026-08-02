import { createGraphLayer } from './render/graph'
import { createOverviewLayer } from './render/overview'
import { createRibbonLayer } from './render/ribbon'
import { createFrameBudget, type GridSeries, type Quality } from './render/budget'
import type { VizQuality } from './driver'
import type { VizSurfaceRenderLayers } from './surface-painter'
import type { RenderMeta } from './render/budget'
import type { SimInput } from './sim/types'

/**
 * @description Creates renderer layers owned by one deterministic visualization driver.
 * @param input - Simulation dimensions used to size renderer-owned data structures.
 * @returns The graph, ribbon, overview, and budget layers for one driver.
 */
export function createVizDriverRenderLayers(
  input: SimInput
): VizSurfaceRenderLayers {
  const grid = createGridSeries(input)
  return {
    budget: createFrameBudget(false),
    graph: createGraphLayer(input.entityCount),
    ribbon: createRibbonLayer(grid),
    overview: createOverviewLayer(grid),
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

/**
 * @description Creates the display metadata shared by all driver renderers.
 * @param repoNames - Repository labels in deterministic simulation order.
 * @returns Renderer metadata with the supplied labels and neutral presentation defaults.
 */
export function createVizRenderMeta(repoNames: readonly string[]): RenderMeta {
  return {
    repos: repoNames.map((short) => ({
      short,
      actor: 0,
      stars: 0,
      isPrivate: false,
    })),
    fileLabel: (id) => String(id),
    agentBirthLabel: null,
    agentBirthSubLabel: null,
  }
}

function createGridSeries(input: SimInput): GridSeries {
  return {
    dayCount: input.dayCount,
    windowStartISO: input.windowStartISO,
    total: new Uint16Array(input.dayCount),
    agent: new Uint16Array(input.dayCount),
    level: new Uint8Array(input.dayCount),
    agentBirthDay: -1,
  }
}

function renderQualityName(tier: VizQuality['tier']): Quality['name'] {
  if (tier === 0) return 'full'
  if (tier === 1) return 'no-file-labels'
  if (tier === 2) return 'no-spokes'
  if (tier === 3) return 'no-shadows'
  return tier === 4 ? 'dpr1' : 'half-files'
}
