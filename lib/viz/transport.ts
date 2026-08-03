import { SPEEDS } from './sim/types'
import { formatTransportDate } from './transport-date'
import type {
  VizTransport,
  VizTransportDriver,
  VizTransportMetadata,
  VizTransportSnapshot,
} from './transport-types'

export type {
  VizTransport,
  VizTransportDriver,
  VizTransportMetadata,
  VizTransportSnapshot,
} from './transport-types'
const INERT_SNAPSHOT: VizTransportSnapshot = {
  ready: false,
  playing: false,
  reducedMotion: false,
  dayIndex: 0,
  dayCount: 0,
  dateLabel: '',
  windowStartLabel: '',
  speedIndex: 0,
  birthDayIndex: -1,
  generatedAt: null,
}

interface BoundTransport {
  readonly driver: VizTransportDriver
  readonly metadata: {
    readonly generatedAt: string | null
    readonly windowStartISO: string
    readonly dayCount: number
    readonly birthDayIndex: number
  }
  unsubscribe: () => void
  unregisterDestroy: () => void
}

let activeTransport: BoundTransport | undefined
let snapshot = INERT_SNAPSHOT
const listeners = new Set<() => void>()

/**
 * @description Returns the process-wide inert-or-bound transport external store.
 * @returns The stable transport facade for external-store consumers.
 */
export function getVizTransport(): VizTransport {
  return transport
}

/**
 * @description Binds one driver to the transport facade until cleanup runs.
 * @param driver - The deterministic driver providing transport state and controls.
 * @param metadata - Payload-derived labels and bounds for the transport snapshot.
 * @returns A cleanup that restores the inert transport when this binding is active.
 */
export function bindVizTransport(
  driver: VizTransportDriver,
  metadata: VizTransportMetadata
): () => void {
  if (activeTransport) unbindTransport(activeTransport, false)
  const binding: BoundTransport = {
    driver,
    metadata: normalizeMetadata(driver, metadata),
    unsubscribe: () => undefined,
    unregisterDestroy: () => undefined,
  }
  binding.unsubscribe = driver.subscribe(() => {
    publish(buildSnapshot(binding))
  })
  binding.unregisterDestroy = driver.onDestroy(() => unbindTransport(binding))
  activeTransport = binding
  publish(buildSnapshot(binding))
  return () => unbindTransport(binding)
}

const transport: VizTransport = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => INERT_SNAPSHOT,
  toggle() {
    const binding = activeTransport
    if (!binding) return
    if (binding.driver.state.playing) void binding.driver.pause()
    else binding.driver.play()
    publish(buildSnapshot(binding))
  },
  seekToDay(dayIndex) {
    const binding = activeTransport
    if (!binding) return
    void binding.driver.seekDay(
      clampInteger(dayIndex, 0, binding.metadata.dayCount - 1)
    )
  },
  setSpeedIndex(speedIndex) {
    const binding = activeTransport
    if (!binding) return
    binding.driver.setSpeedIndex(clampInteger(speedIndex, 0, SPEEDS.length - 1))
    publish(buildSnapshot(binding))
  },
}

function normalizeMetadata(
  driver: VizTransportDriver,
  metadata: VizTransportMetadata
): BoundTransport['metadata'] {
  return {
    generatedAt: metadata.generatedAt ?? null,
    windowStartISO: metadata.windowStartISO ?? driver.state.windowStartISO,
    dayCount: resolveDayCount(driver, metadata),
    birthDayIndex: metadata.birthDayIndex ?? -1,
  }
}

function resolveDayCount(
  driver: VizTransportDriver,
  metadata: VizTransportMetadata
): number {
  if (isPositiveInteger(metadata.dayCount)) return metadata.dayCount
  if (isInteger(metadata.dayStart) && isInteger(metadata.dayEnd))
    return Math.max(1, metadata.dayEnd - metadata.dayStart + 1)
  return driver.state.dayCount
}

function buildSnapshot(binding: BoundTransport): VizTransportSnapshot {
  const info = binding.driver.inspect()
  const dayIndex = clampInteger(
    binding.driver.state.cursorDayInt,
    0,
    binding.metadata.dayCount - 1
  )
  const next: VizTransportSnapshot = {
    ready: true,
    playing: binding.driver.state.playing,
    reducedMotion: info.reducedMotion,
    dayIndex,
    dayCount: binding.metadata.dayCount,
    dateLabel: formatTransportDate(info.date),
    windowStartLabel: binding.metadata.windowStartISO.slice(0, 4),
    speedIndex: binding.driver.state.speedIndex,
    birthDayIndex: binding.metadata.birthDayIndex,
    generatedAt: binding.metadata.generatedAt,
  }
  return sameSnapshot(snapshot, next) ? snapshot : next
}

function isInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value)
}

function isPositiveInteger(value: number | undefined): value is number {
  return isInteger(value) && value > 0
}

function clampInteger(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  const finite = Number.isFinite(value) ? value : value < 0 ? min : max
  return Math.min(max, Math.max(min, Math.floor(finite)))
}

function publish(next: VizTransportSnapshot): void {
  if (sameSnapshot(snapshot, next)) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

function sameSnapshot(
  left: VizTransportSnapshot,
  right: VizTransportSnapshot
): boolean {
  return (
    left.ready === right.ready &&
    left.playing === right.playing &&
    left.reducedMotion === right.reducedMotion &&
    left.dayIndex === right.dayIndex &&
    left.dayCount === right.dayCount &&
    left.dateLabel === right.dateLabel &&
    left.windowStartLabel === right.windowStartLabel &&
    left.speedIndex === right.speedIndex &&
    left.birthDayIndex === right.birthDayIndex &&
    left.generatedAt === right.generatedAt
  )
}

function unbindTransport(binding: BoundTransport, publishInert = true): void {
  if (activeTransport !== binding) return
  activeTransport = undefined
  binding.unsubscribe()
  binding.unregisterDestroy()
  if (publishInert) publish(INERT_SNAPSHOT)
}
