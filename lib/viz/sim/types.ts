/** Sentinel day index meaning an entity remains alive through the window. */
export const DAY_ALIVE = 0x7fffffff;

/** Playback speeds in days per second. */
export const SPEEDS = [4, 8, 12, 20, 32] as const;

/** Fixed simulation timestep in seconds. */
export const FIXED_DT = 1 / 120;
/** Maximum fixed steps simulated in one rendered frame. */
export const MAX_STEPS = 8;
/** Fixed beam ring-buffer capacity. */
export const MAX_BEAMS = 256;

/** Dwell tails in days, applied after an entity's last touch. */
export const DWELL_TAIL_DAYS = { repo: 90, file: 30 } as const;

export const ENTITY_REPO = 0;
export const ENTITY_FILE = 1;

export const PHASE_ABSENT = 0;
export const PHASE_LIVE = 1;
export const PHASE_GHOST = 2;

/** Three-state visibility classification for repository entities. */
export type RepoPhase =
  | typeof PHASE_ABSENT
  | typeof PHASE_LIVE
  | typeof PHASE_GHOST;

/**
 * @description Structural payload accepted by the simulation core.
 * Day zero maps to windowStartISO and day indices increase with calendar time.
 */
export interface SimInput {
  readonly dayCount: number;
  readonly windowStartISO: string;
  readonly repoCount: number;
  readonly entityCount: number;
  readonly kind: Uint8Array;
  readonly repoOf: Int32Array;
  readonly birthDay: Int32Array;
  readonly lastTouchDay: Int32Array;
}

/**
 * @description Mutable, structuredClone-safe state for one deterministic simulation.
 * Static entity fields are initialized once, while downstream modules update channels.
 */
export interface SimState {
  tick: number;
  cursorDay: number;
  cursorDayInt: number;
  playing: boolean;
  speedIndex: number;
  rngState: number;
  rngDraws: number;
  entityCount: number;
  repoCount: number;
  dayCount: number;
  windowStartISO: string;
  kind: Uint8Array;
  repoOf: Int32Array;
  birth: Int32Array;
  death: Int32Array;
  byDeath: Int32Array;
  live: Int32Array;
  slot: Int32Array;
  nLive: number;
  pDeath: number;
  alpha: Float32Array;
  heat: Float32Array;
  px: Float32Array;
  py: Float32Array;
  pr: Float32Array;
  repoAngle: Float32Array;
  repoX: Float32Array;
  repoY: Float32Array;
  repoR: Float32Array;
  repoAlpha: Float32Array;
  actorX: Float32Array;
  actorY: Float32Array;
  actorTX: Float32Array;
  actorTY: Float32Array;
  beamEnt: Int32Array;
  beamActor: Uint8Array;
  beamKind: Uint8Array;
  beamLife: Float32Array;
  beamHead: number;
}

/**
 * @description Path-independent projection used to compare rendered frames.
 */
export interface SimStateDigest {
  tick: number;
  cursorDay: number;
  cursorDayInt: number;
  rngState: number;
  rngDraws: number;
  nLive: number;
  liveHash: number;
  ghostRepos: number;
}
