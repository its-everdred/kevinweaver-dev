import type { ActorLogin } from './identity.ts'
import { z } from 'zod'

const MAX_API_REPOSITORIES = 100
const MIN_RATE_LIMIT_REMAINING = 50
const CATEGORIES = [
  'commit',
  'pullRequest',
  'issue',
  'pullRequestReview',
] as const
type ContributionCategory = (typeof CATEGORIES)[number]

export interface DiscoveredRepo {
  nameWithOwner: string
  databaseId: number
  isPrivate: boolean
  isFork: boolean
  isArchived: boolean
  stargazerCount: number
  createdAt: string
  contributions: Record<ContributionCategory, number>
}

export interface RepoCountDefinition {
  definition: 'ownerPublicNonFork'
  count: number
  byActor: Readonly<Record<ActorLogin, number>>
}

export interface DiscoveryResult {
  windowStart: string
  windowEnd: string
  actors: readonly ActorLogin[]
  repos: readonly DiscoveredRepo[]
  repoCountDefinition: RepoCountDefinition
  queryCost: number
}

export type GraphQlClient = <T>(
  query: string,
  variables: Record<string, unknown>
) => Promise<T>

export interface DiscoverOptions {
  logins: readonly ActorLogin[]
  fromYear: number
  toYear: number
  maxRepositories?: number
}

export const DISCOVERY_QUERY = `query Discover($login: String!, $from: DateTime!, $to: DateTime!, $max: Int!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: $max) { repository { nameWithOwner databaseId isPrivate isFork isArchived stargazerCount createdAt } contributions { totalCount } }
      pullRequestContributionsByRepository(maxRepositories: $max) { repository { nameWithOwner databaseId isPrivate isFork isArchived stargazerCount createdAt } contributions { totalCount } }
      issueContributionsByRepository(maxRepositories: $max) { repository { nameWithOwner databaseId isPrivate isFork isArchived stargazerCount createdAt } contributions { totalCount } }
      pullRequestReviewContributionsByRepository(maxRepositories: $max) { repository { nameWithOwner databaseId isPrivate isFork isArchived stargazerCount createdAt } contributions { totalCount } }
    }
  }
  rateLimit { cost remaining }
}`

export const REPO_COUNT_QUERY = `query RepoCount($login: String!) {
  user(login: $login) { repositories(ownerAffiliations: [OWNER], privacy: PUBLIC, isFork: false) { totalCount } }
  rateLimit { cost remaining }
}`

const RepositorySchema = z.object({
  nameWithOwner: z.string(),
  databaseId: z.number().int().nonnegative(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  stargazerCount: z.number(),
  createdAt: z.string(),
})
const ContributionSchema = z.object({
  repository: RepositorySchema,
  contributions: z.object({ totalCount: z.number() }),
})
const RateLimitSchema = z.object({ cost: z.number(), remaining: z.number() })
const DiscoveryPayloadSchema = z.object({
  user: z.object({
    contributionsCollection: z.object({
      commitContributionsByRepository: z.array(ContributionSchema),
      pullRequestContributionsByRepository: z.array(ContributionSchema),
      issueContributionsByRepository: z.array(ContributionSchema),
      pullRequestReviewContributionsByRepository: z.array(ContributionSchema),
    }),
  }),
  rateLimit: RateLimitSchema,
})
const RepoCountPayloadSchema = z.object({
  user: z.object({ repositories: z.object({ totalCount: z.number() }) }),
  rateLimit: RateLimitSchema,
})
type ApiContribution = z.infer<typeof ContributionSchema>
type DiscoveryPayload = z.infer<typeof DiscoveryPayloadSchema>
type RepoCountPayload = z.infer<typeof RepoCountPayloadSchema>
type ConnectionKey = keyof DiscoveryPayload['user']['contributionsCollection']
const CONNECTIONS: Readonly<Record<ContributionCategory, ConnectionKey>> = {
  commit: 'commitContributionsByRepository',
  pullRequest: 'pullRequestContributionsByRepository',
  issue: 'issueContributionsByRepository',
  pullRequestReview: 'pullRequestReviewContributionsByRepository',
}

class DiscoveryResponseError extends Error {
  constructor() {
    super('GitHub discovery response was malformed or incomplete')
    this.name = 'DiscoveryResponseError'
  }
}

interface QueryRequest {
  login: ActorLogin
  from: string
  to: string
}

function windowBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` }
}

function requestsFor(options: DiscoverOptions): QueryRequest[] {
  return options.logins.flatMap((login) =>
    Array.from(
      { length: options.toYear - options.fromYear + 1 },
      (_, offset) => {
        const bounds = windowBounds(options.fromYear + offset)
        return { login, ...bounds }
      }
    )
  )
}

function emptyContributions(): Record<ContributionCategory, number> {
  return { commit: 0, pullRequest: 0, issue: 0, pullRequestReview: 0 }
}

function mergeContribution(
  repos: Map<string, DiscoveredRepo>,
  item: ApiContribution,
  category: ContributionCategory
): void {
  if (item.repository.isPrivate) return
  const existing = repos.get(item.repository.nameWithOwner)
  if (existing) {
    existing.contributions[category] += item.contributions.totalCount
    return
  }
  repos.set(item.repository.nameWithOwner, {
    ...item.repository,
    contributions: {
      ...emptyContributions(),
      [category]: item.contributions.totalCount,
    },
  })
}

function checkRateLimit(remaining: number): void {
  if (remaining < MIN_RATE_LIMIT_REMAINING) {
    throw new Error(
      `GitHub rate limit remaining below ${MIN_RATE_LIMIT_REMAINING}: ${remaining}`
    )
  }
}

async function discoverWindow(
  client: GraphQlClient,
  request: QueryRequest,
  maxRepositories: number
): Promise<DiscoveryPayload> {
  const rawResponse = await client<unknown>(DISCOVERY_QUERY, {
    login: request.login,
    from: request.from,
    to: request.to,
    max: maxRepositories,
  })
  const parsed = DiscoveryPayloadSchema.safeParse(rawResponse)
  if (!parsed.success) throw new DiscoveryResponseError()
  const response = parsed.data
  checkRateLimit(response.rateLimit.remaining)
  return response
}

async function countRepos(
  client: GraphQlClient,
  login: ActorLogin
): Promise<RepoCountPayload> {
  const rawResponse = await client<unknown>(REPO_COUNT_QUERY, { login })
  const parsed = RepoCountPayloadSchema.safeParse(rawResponse)
  if (!parsed.success) throw new DiscoveryResponseError()
  const response = parsed.data
  checkRateLimit(response.rateLimit.remaining)
  return response
}

function collectWindow(
  repos: Map<string, DiscoveredRepo>,
  response: DiscoveryPayload,
  maxRepositories: number
): void {
  const connections = response.user?.contributionsCollection
  if (!connections) return
  CATEGORIES.forEach((category) => {
    const entries = connections[CONNECTIONS[category]]
    if (entries.length === maxRepositories)
      throw new Error('GitHub contribution connection was truncated')
    entries.forEach((entry) => mergeContribution(repos, entry, category))
  })
}

/**
 * Discovers the deterministic public repository scope from injected GraphQL responses.
 * @param client GraphQL transport supplied by the pipeline caller.
 * @param options Login and calendar-window inputs for discovery.
 * @returns Sorted repositories and the computed repository-count definition.
 */
export async function discoverRepos(
  client: GraphQlClient,
  options: DiscoverOptions
): Promise<DiscoveryResult> {
  const maxRepositories = options.maxRepositories ?? MAX_API_REPOSITORIES
  if (maxRepositories < 1 || maxRepositories > MAX_API_REPOSITORIES) {
    throw new Error(
      `maxRepositories must be between 1 and ${MAX_API_REPOSITORIES}`
    )
  }
  const requests = requestsFor(options)
  const responses = await Promise.all(
    requests.map((request) => discoverWindow(client, request, maxRepositories))
  )
  const counts = await Promise.all(
    options.logins.map((login) => countRepos(client, login))
  )
  const repos = new Map<string, DiscoveredRepo>()
  responses.forEach((response) =>
    collectWindow(repos, response, maxRepositories)
  )
  const sortedRepos = [...repos.values()].sort((a, b) =>
    a.nameWithOwner < b.nameWithOwner
      ? -1
      : a.nameWithOwner > b.nameWithOwner
        ? 1
        : 0
  )
  const byActor: Record<ActorLogin, number> = {
    'its-everdred': 0,
    'its-applekid': 0,
  }
  options.logins.forEach((login, index) => {
    byActor[login] = counts[index]?.user?.repositories.totalCount ?? 0
  })
  return {
    windowStart: windowBounds(options.fromYear).from,
    windowEnd: windowBounds(options.toYear).to,
    actors: options.logins,
    repos: sortedRepos,
    repoCountDefinition: {
      definition: 'ownerPublicNonFork',
      count: Object.values(byActor).reduce((sum, count) => sum + count, 0),
      byActor,
    },
    queryCost: [...responses, ...counts].reduce(
      (sum, response) => sum + response.rateLimit.cost,
      0
    ),
  }
}
