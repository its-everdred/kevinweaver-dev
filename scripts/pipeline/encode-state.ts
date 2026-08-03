import type { PipelineState, RepoPipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { bootstrapState, mergeRepoState } from './state.ts'
import type { EncodedBundle, EncodeInput, RepoInput } from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { bundleHash } from './encode-hash.ts'
export function nextState(
  previous: PipelineState | null,
  bundle: EncodedBundle,
  input: EncodeInput
): PipelineState {
  return {
    ...(previous ?? bootstrapState()),
    schema: 1,
    lastRun: bundle.manifest.generatedAt,
    refs: input.refs,
    repoCountDefinition: input.repoCountDefinition,
    samlCanary: bundle.samlCanary.ok ? 'ok' : 'failed',
    combinedTotal: bundle.combinedTotal,
    events: bundle.manifest.events,
    bundleHash: bundleHash(bundle),
    repos: nextRepositories(previous, input, bundle.manifest.generatedAt),
  }
}

function nextRepositories(
  previous: PipelineState | null,
  input: EncodeInput,
  generatedAt: string
): Record<string, RepoPipelineState> {
  const next = new Map<string, RepoPipelineState>()
  input.repos.forEach((repo) => {
    next.set(
      repo.n,
      repositoryState(previous?.repos[repo.n], repo, input, generatedAt)
    )
  })
  Object.entries(previous?.repos ?? {}).forEach(([name, repo]) => {
    if (!next.has(name)) next.set(name, retainedRepository(repo))
  })
  return Object.fromEntries(next)
}
function repositoryState(
  previous: RepoPipelineState | undefined,
  repo: RepoInput,
  input: EncodeInput,
  generatedAt: string
): RepoPipelineState {
  const next: RepoPipelineState = {
    databaseId: repo.databaseId,
    stargazerCount: repo.stargazerCount,
    heads: repo.heads ?? previous?.heads ?? {},
    events: input.events.filter((event) => event.repo === repo.n).length,
    lastEventDay: repo.last ?? previous?.lastEventDay,
    status: repo.status,
    lastOk: repo.status === 'ok' ? generatedAt : (previous?.lastOk ?? null),
    consecutiveFailures:
      repo.status === 'ok' ? 0 : (previous?.consecutiveFailures ?? 0),
  }
  return mergeRepoState(previous, next)
}

function retainedRepository(repo: RepoPipelineState): RepoPipelineState {
  const consecutiveFailures = repo.consecutiveFailures + 1
  return {
    ...repo,
    status: consecutiveFailures >= 7 ? 'gone' : 'stale',
    consecutiveFailures,
  }
}
