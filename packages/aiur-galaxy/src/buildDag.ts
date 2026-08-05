import type { DagNode, FileDag, RepoSnapshot } from './types'

const ROOT_ID = ''
const ROOT_NAME = '.'

/** Mutable build-time node; children is populated during construction. */
interface MutableDagNode extends Omit<DagNode, 'children' | 'depth'> {
  readonly children: string[]
  depth: number
}

/** Builds a directory-entry node for a path segment. */
function dirNode(path: string, name: string, parent: string | null): MutableDagNode {
  return {
    id: path,
    path,
    name,
    isFile: false,
    parent,
    children: [],
    depth: 0,
  }
}

/** Builds a file-leaf node for a full repo-relative path. */
function fileNode(path: string, parent: string): MutableDagNode {
  return {
    id: path,
    path,
    name: baseName(path),
    isFile: true,
    parent,
    children: [],
    depth: 0,
  }
}

function baseName(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

function dirPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? ROOT_ID : path.slice(0, index)
}

/**
 * @description Builds the repo file tree as a directed graph.
 * @param snapshot The repo snapshot whose file list becomes the DAG.
 * @returns The file-tree DAG with the repo root as its single root node.
 *
 * Every directory that contains at least one file becomes an intermediate
 * node, so the DAG mirrors the repo's real structure.
 */
export function buildFileDag(snapshot: RepoSnapshot): FileDag {
  const nodes = new Map<string, MutableDagNode>()
  nodes.set(ROOT_ID, dirNode(ROOT_ID, ROOT_NAME, null))

  for (const file of snapshot.files) {
    addFile(nodes, file.path)
  }

  assignDepths(nodes)
  return { nodes, rootId: ROOT_ID }
}

function addFile(nodes: Map<string, MutableDagNode>, path: string): void {
  if (path.length === 0 || nodes.has(path)) return
  const parentPath = dirPath(path)
  ensureDir(nodes, parentPath)
  const node = fileNode(path, parentPath)
  nodes.set(path, node)
  const parent = nodes.get(parentPath)
  if (parent) parent.children.push(path)
}

function ensureDir(nodes: Map<string, MutableDagNode>, path: string): void {
  if (nodes.has(path)) return
  const parentPath = dirPath(path)
  if (parentPath !== ROOT_ID) ensureDir(nodes, parentPath)
  const node = dirNode(path, baseName(path), parentPath)
  nodes.set(path, node)
  const parent = nodes.get(parentPath)
  if (parent) parent.children.push(path)
}

function assignDepths(nodes: Map<string, MutableDagNode>): void {
  const stack: string[] = [ROOT_ID]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined) continue
    const node = nodes.get(id)
    if (!node) continue
    for (const childId of node.children) {
      const child = nodes.get(childId)
      if (!child) continue
      child.depth = node.depth + 1
      stack.push(childId)
    }
  }
}
