import type { SimState } from './sim/types'

/** The animation action a driver must perform after a media preference change. */
export type VizMediaAction = 'pause-and-settle' | 'resume' | 'publish'

/** Tracks driver lifecycle state while leaving frame ownership to the driver. */
export interface VizDriverLifecycle {
  readonly running: boolean
  readonly destroyed: boolean
  readonly reducedMotion: boolean
  start(): boolean
  stop(): void
  destroy(): void
  mediaChanged(matches: boolean): VizMediaAction
}

/** Creates lifecycle state for one visualization driver. */
export function createVizDriverLifecycle(
  state: SimState,
  reducedMotion: boolean
): VizDriverLifecycle {
  return new DriverLifecycle(state, reducedMotion)
}

class DriverLifecycle implements VizDriverLifecycle {
  #running = false
  #destroyed = false
  #resumeAfterReduce = false

  constructor(
    private readonly state: SimState,
    private reduced = false
  ) {}

  get running(): boolean {
    return this.#running
  }
  get destroyed(): boolean {
    return this.#destroyed
  }
  get reducedMotion(): boolean {
    return this.reduced
  }
  start(): boolean {
    if (this.#running || this.reduced || this.#destroyed) return false
    this.#running = true
    this.state.playing = true
    return true
  }
  stop(): void {
    this.#running = false
    this.state.playing = false
  }
  destroy(): void {
    this.#destroyed = true
    this.stop()
  }
  mediaChanged(matches: boolean): VizMediaAction {
    this.reduced = matches
    if (matches) return this.pauseForReducedMotion()
    return this.resumeAfterReducedMotion()
  }
  private pauseForReducedMotion(): VizMediaAction {
    this.#resumeAfterReduce = this.#running
    this.stop()
    return 'pause-and-settle'
  }
  private resumeAfterReducedMotion(): VizMediaAction {
    if (!this.#resumeAfterReduce) return 'publish'
    this.#resumeAfterReduce = false
    this.#running = true
    this.state.playing = true
    return 'resume'
  }
}
