export { buildFileDag } from './buildDag'
export { buildUniverse, type UniverseEvent, type UniverseRepoInput } from './buildUniverse'
export {
  buildGalaxyPoints,
  createGalaxyScene,
  type GalaxyScene,
  type GalaxySceneOptions,
  type GalaxySceneTheme,
  type SceneContributor,
} from './galaxyScene'
export { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './galaxyShader'
export {
  layoutDag,
  type DagLayout,
  type DagPosition,
} from './layout'
export {
  DISC_FIELD_RADIUS,
  layoutUniverse,
  starKey,
  type RepoArm,
  type StarPosition,
  type UniverseLayout,
} from './galaxy'
export {
  clampCommitIndex,
  liveFilesAt,
  nextCommitIndex,
  playbackFrame,
} from './playback'
export {
  DEFAULT_THEME,
  renderDag,
  type DagRenderState,
  type DagTheme,
  type RenderMetrics,
} from './render'
export {
  clampStep,
  nextUniverseStep,
  universeFrame,
  universeLiveAt,
  type UniverseFrame,
} from './universePlayback'
export {
  DEFAULT_UNIVERSE_THEME,
  renderUniverse,
  resolveContributors,
  type ContributorNode,
  type StarHit,
  type UniverseMetrics,
  type UniversePointer,
  type UniverseRenderState,
  type UniverseTheme,
} from './universeRender'
export type {
  DagNode,
  FileDag,
  PlaybackDirection,
  PlaybackFrame,
  RepoSnapshot,
  SnapshotCommit,
  SnapshotFile,
  UniverseActor,
  UniverseContribution,
  UniverseRepo,
  UniverseSnapshot,
} from './types'
