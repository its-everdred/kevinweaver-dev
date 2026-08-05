import type { DagNode, FileDag } from './types'

/** A node position in normalized field units (both axes in [0, 1]). */
export interface DagPosition {
  readonly x: number
  readonly y: number
}

/** Result of laying out a file-tree DAG. */
export interface DagLayout {
  readonly positions: ReadonlyMap<string, DagPosition>
  /** Field center, useful for repo-root emphasis. */
  readonly center: { readonly x: number; readonly y: number }
  /** True when the DAG has at least one file node. */
  readonly hasFiles: boolean
}

const CENTER = 0.5
const MIN_RADIUS = 0.05
const MAX_RADIUS = 0.46

/**
 * @description Lays out a file-tree DAG as concentric rings of file nodes,
 * one ring per depth, ordered deterministically by file path.
 * @param dag The file-tree DAG to position.
 * @returns Per-node positions in normalized field units.
 *
 * Deterministic: ordering comes from the stable sorted file list, never from
 * insertion order or randomness, so renders are bit-reproducible.
 */
export function layoutDag(dag: FileDag): DagLayout {
  const files = [...dag.nodes.values()]
    .filter((node) => node.isFile)
    .sort((left, right) => left.path.localeCompare(right.path))
  const positions = new Map<string, DagPosition>()

  for (const node of files) {
    positions.set(node.id, positionFor(node, files.length, fileRank(files, node.path)))
  }

  return {
    positions,
    center: { x: CENTER, y: CENTER },
    hasFiles: files.length > 0,
  }
}

function fileRank(files: readonly DagNode[], path: string): number {
  for (let index = 0; index < files.length; index++) {
    if (files[index]?.path === path) return index
  }
  return 0
}

function positionFor(node: DagNode, total: number, rank: number): DagPosition {
  const depth = Math.max(1, node.depth)
  const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * (1 - 1 / (1 + depth * 0.6))
  const angle = rank / Math.max(1, total)
  return {
    x: CENTER + Math.cos(angle * Math.PI * 2) * radius,
    y: CENTER + Math.sin(angle * Math.PI * 2) * radius,
  }
}
