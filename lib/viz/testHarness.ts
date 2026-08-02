import type { VizDriver, VizFrameInfo } from './driver'

export interface VizTestHarness {
  pause(): Promise<void>
  play(): void
  reset(seed?: number): void
  renderFrame(steps?: number): Promise<VizFrameInfo>
  seekTick(tick: number): Promise<VizFrameInfo>
  seekDate(iso: string): Promise<VizFrameInfo>
  inspect(): VizFrameInfo
  setQuality(quality: 'high' | 'low' | 'auto'): void
}

declare global {
  interface Window {
    __viz?: VizTestHarness
  }
}

export function installTestHarness(driver: VizDriver): () => void {
  if (typeof window === 'undefined') return () => undefined
  const params = new URLSearchParams(window.location.search)
  if (params.get('viz-test') !== '1') return () => undefined
  const seed = params.get('seed')
  if (seed !== null) driver.reset(Number(seed))
  driver.setQuality('high')
  const harness = createHarness(driver)
  window.__viz = harness
  const remove = () => removeHarness(harness)
  const unsubscribe = driver.onDestroy(remove)
  return () => {
    unsubscribe()
    remove()
  }
}

function createHarness(driver: VizDriver): VizTestHarness {
  return {
    pause: () => driver.pause(),
    play: () => driver.play(),
    reset: (nextSeed) => driver.reset(nextSeed),
    renderFrame: (steps) => driver.renderFrame(steps),
    seekTick: (tick) => driver.seekTick(tick),
    seekDate: (iso) => driver.seekDate(iso),
    inspect: () => driver.inspect(),
    setQuality: (quality) => driver.setQuality(quality),
  }
}

function removeHarness(harness: VizTestHarness): void {
  if (window.__viz === harness) delete window.__viz
}
