import type {
  VizDriverOptions,
  VizDriverRenderData,
} from '../../lib/viz/driver'
import type { SimInput } from '../../lib/viz/sim/types'

/**
 * @description Creates neutral renderer data for deterministic driver tests.
 * @param input Simulation dimensions mirrored by the renderer data.
 * @param repoNames Repository labels in simulation order.
 * @returns Renderer data with zero contribution values and public human repositories.
 */
export function createDriverRenderData(
  input: SimInput,
  repoNames: readonly string[]
): VizDriverRenderData {
  return {
    grid: {
      dayCount: input.dayCount,
      windowStartISO: input.windowStartISO,
      total: new Uint16Array(input.dayCount),
      agent: new Uint16Array(input.dayCount),
      level: new Uint8Array(input.dayCount),
      agentBirthDay: -1,
    },
    meta: {
      repos: repoNames.map((short) => ({
        short,
        actor: 0,
        stars: 0,
        isPrivate: false,
      })),
      fileLabel: (id) => String(id),
      agentBirthLabel: null,
      agentBirthSubLabel: null,
    },
  }
}

/**
 * @description Creates complete driver options for tests that do not inspect rendering data.
 * @param input Simulation input for the driver.
 * @param repoNames Repository labels in simulation order.
 * @param seed Deterministic simulation seed.
 * @returns Driver options carrying dimensionally matching renderer data.
 */
export function createDriverOptions(
  input: SimInput,
  repoNames: readonly string[],
  seed: number
): VizDriverOptions {
  return { input, render: createDriverRenderData(input, repoNames), seed }
}
