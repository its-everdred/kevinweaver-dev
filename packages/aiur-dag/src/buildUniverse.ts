import type { UniverseRepo, UniverseSnapshot } from './types'

/** Host-agnostic contribution event: repo id, file path, timeline step. */
export interface UniverseEvent {
  readonly repo: number
  readonly path: string
  /** Timeline step index (0 is the oldest step). */
  readonly step: number
}

/** Host-agnostic repo record for building a universe snapshot. */
export interface UniverseRepoInput {
  readonly id: number
  readonly name: string
}

/**
 * @description Builds a universe snapshot from host-agnostic repos and events.
 * @param repos Repo records, each with a stable id and name.
 * @param events All contribution events across repos.
 * @param stepCount Total timeline steps.
 * @returns The universe snapshot with per-repo file lists.
 *
 * Files are the distinct paths touched by each repo's events; the timeline is
 * the union of event steps. This keeps the package host-agnostic while the
 * embed supplies bundle-shaped data.
 */
export function buildUniverse(
  repos: readonly UniverseRepoInput[],
  events: readonly UniverseEvent[],
  stepCount: number
): UniverseSnapshot {
  const fileSets = new Map<number, Set<string>>()
  for (const event of events) {
    const files = fileSets.get(event.repo)
    if (files) {
      files.add(event.path)
    } else {
      fileSets.set(event.repo, new Set([event.path]))
    }
  }
  const universeRepos: UniverseRepo[] = []
  for (const repo of repos) {
    const files = fileSets.get(repo.id)
    if (!files || files.size === 0) continue
    universeRepos.push({ id: repo.id, name: repo.name, files: [...files].sort() })
  }
  const contributions = events
    .map((event) => ({ step: event.step, repo: event.repo, file: event.path }))
    .sort(compareContributions)
  return { repos: universeRepos, contributions, stepCount }
}

function compareContributions(
  left: { readonly step: number; readonly repo: number; readonly file: string },
  right: { readonly step: number; readonly repo: number; readonly file: string }
): number {
  return (
    left.step - right.step ||
    left.repo - right.repo ||
    left.file.localeCompare(right.file)
  )
}
