/** Payload metadata required to present a transport snapshot. */
export interface VizTransportMetadata {
  readonly generatedAt?: string | null
  readonly windowStartISO?: string
  readonly windowEndISO?: string
  readonly dayCount?: number
  readonly dayStart?: number
  readonly dayEnd?: number
  readonly birthDayIndex?: number
}

/** The stable, React external-store projection of one bound visualization. */
export interface VizTransportSnapshot {
  readonly ready: boolean
  readonly playing: boolean
  readonly reducedMotion: boolean
  readonly dayIndex: number
  readonly dayCount: number
  readonly dateLabel: string
  readonly windowStartLabel: string
  readonly speedIndex: number
  readonly birthDayIndex: number
  readonly generatedAt: string | null
}

/** Playback controls exposed to the transport region. */
export interface VizTransport {
  subscribe(listener: () => void): () => void
  getSnapshot(): VizTransportSnapshot
  getServerSnapshot(): VizTransportSnapshot
  toggle(): void
  seekToDay(dayIndex: number): void
  setSpeedIndex(speedIndex: number): void
}

/** The bounded driver surface used by the transport facade. */
export interface VizTransportDriver {
  readonly state: {
    readonly dayCount: number
    readonly windowStartISO: string
    readonly cursorDayInt: number
    readonly speedIndex: number
    readonly playing: boolean
  }
  play(): void
  pause(): Promise<void>
  setSpeedIndex(index: number): void
  seekDay(day: number): Promise<unknown>
  inspect(): {
    readonly playing: boolean
    readonly reducedMotion: boolean
    readonly date: string
  }
  subscribe(listener: () => void): () => void
  onDestroy(listener: () => void): () => void
}
