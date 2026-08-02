import {
  createVizRibbonPointerState,
  highlightVizRibbonPointer,
  type VizRibbonHighlight,
  type VizRibbonPointerState,
} from './surface-pointer'
import type { RenderView } from './render/budget'
import type { RibbonLayer } from './render/ribbon'
import type { SimInput } from './sim/types'
import type { VizPointer } from './surfaces'

/** Resolves pointer highlights while the driver owns ribbon window selection. */
export interface VizDriverRibbon {
  setPointer(point: VizPointer | null, view: RenderView): VizRibbonHighlight
  refreshPointer(view: RenderView): void
  pointerHighlight(): VizRibbonHighlight | undefined
}

/** Inputs the ribbon coordinator needs from its owning driver. */
export interface VizDriverRibbonOptions {
  readonly input: SimInput
  readonly layer: RibbonLayer
  readonly syncWindow: () => number
  readonly highlightCell: (
    day: number,
    winStart: number
  ) => VizRibbonHighlight
}

/** Creates pointer coordination without introducing a second paint owner. */
export function createVizDriverRibbon(
  options: VizDriverRibbonOptions
): VizDriverRibbon {
  return new DriverRibbon(options)
}

class DriverRibbon implements VizDriverRibbon {
  readonly #pointer: VizRibbonPointerState

  constructor(private readonly options: VizDriverRibbonOptions) {
    this.#pointer = createVizRibbonPointerState(this.highlight.bind(this))
  }

  setPointer(point: VizPointer | null, view: RenderView): VizRibbonHighlight {
    return this.#pointer.set(point, view)
  }
  refreshPointer(view: RenderView): void {
    this.#pointer.refresh(view)
  }
  pointerHighlight(): VizRibbonHighlight | undefined {
    return this.#pointer.value()
  }
  private highlight(point: VizPointer, view: RenderView): VizRibbonHighlight {
    this.options.syncWindow()
    return highlightVizRibbonPointer(
      this.options.input,
      this.options.layer,
      view,
      point,
      this.options.highlightCell
    )
  }
}
