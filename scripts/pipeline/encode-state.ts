import type { PipelineState, RepoPipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { bootstrapState, mergeRepoState } from './state.ts'
import type { EncodedBundle, EncodeInput, RepoInput } from './encode-types.ts'
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
    repos: Object.fromEntries(
      input.repos.map((repo) => [
        repo.n,
        repositoryState(
          previous?.repos[repo.n],
          repo,
          input,
          bundle.manifest.generatedAt
        ),
      ])
    ),
  }
}
function repositoryState(
  previous: RepoPipelineState | undefined,
  repo: RepoInput,
  input: EncodeInput,
  generatedAt: string
): RepoPipelineState {
  const next: RepoPipelineState = {
    heads: previous?.heads ?? {},
    events: input.events.filter((event) => event.repo === repo.n).length,
    lastEventDay: repo.last,
    status: repo.status,
    lastOk: repo.status === 'ok' ? generatedAt : (previous?.lastOk ?? null),
    consecutiveFailures:
      repo.status === 'ok' ? 0 : (previous?.consecutiveFailures ?? 0),
  }
  return mergeRepoState(previous, next)
}
