import { GraphqlResponseError, graphql } from "@octokit/graphql";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export type GraphqlRequest = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
export type ActorLogin = "its-everdred" | "its-applekid";

export interface CalendarDay { date: string; count: number }
export interface ActorCalendar { login: ActorLogin; yearTotals: Record<string, number>; days: CalendarDay[] }
export interface SamlCanary {
  ok: boolean; probeRepository: string; sawRepository: boolean; sawOrgContribution: boolean;
  window: string | null; checkedAt: string; detail: string;
}
export interface CalendarBundle {
  source: "github-graphql"; generatedAt: string; windowStart: string; windowEnd: string;
  dayCount: number; canary: SamlCanary; actors: ActorCalendar[];
  combined: { date: string; e: number; a: number }[];
  combinedTotalNaive: number; combinedTotalDeduplicated: number | null; degraded: string[];
}

const CALENDAR_QUERY = `query Cal($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    restrictedContributionsCount contributionCalendar { totalContributions
      weeks { contributionDays { date contributionCount } }
    }
  } } rateLimit { cost remaining }
}`;
const CANARY_QUERY = `query SamlCanary($owner: String!, $name: String!, $login: String!, $from: DateTime!, $to: DateTime!) {
  repository(owner: $owner, name: $name) { nameWithOwner isPrivate stargazerCount }
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    commitContributionsByRepository(maxRepositories: 100) {
      repository { owner { login } } contributions { totalCount }
    }
  } } rateLimit { cost remaining }
}`;

const canarySchema = z.object({
  repository: z.object({ nameWithOwner: z.string(), isPrivate: z.boolean() }).nullable(),
  user: z.object({ contributionsCollection: z.object({
    commitContributionsByRepository: z.array(z.object({
      repository: z.object({ owner: z.object({ login: z.string() }) }),
      contributions: z.object({ totalCount: z.number().int() }),
    })),
  }) }), rateLimit: z.object({ remaining: z.number().int() }),
});
const calendarSchema = z.object({
  user: z.object({ contributionsCollection: z.object({
    restrictedContributionsCount: z.number().int().nonnegative(),
    contributionCalendar: z.object({
      totalContributions: z.number().int().nonnegative(),
      weeks: z.array(z.object({ contributionDays: z.array(z.object({ date: z.string(), contributionCount: z.number().int().nonnegative() })) })),
    }),
  }) }), rateLimit: z.object({ remaining: z.number().int() }),
});

export class SamlCanaryError extends Error {
  readonly canary: SamlCanary;
  constructor(canary: SamlCanary) { super(canary.detail); this.name = "SamlCanaryError"; this.canary = canary; }
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const isRateLimited = (error: unknown) => error instanceof GraphqlResponseError && error.errors?.some((entry) => entry.type === "RATE_LIMITED");

export function createContribClient(token: string): GraphqlRequest {
  if (!token) throw new Error("CONTRIB_TOKEN is required (GATE-003)");
  const client = graphql.defaults({ headers: { authorization: `token ${token}`, "user-agent": "kevinweaver-dev-pipeline" } });
  return async <T>(query: string, variables: Record<string, unknown> = {}) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await client<T>(query, variables);
        const remaining = (response as { rateLimit?: { remaining?: number } }).rateLimit?.remaining;
        if (remaining !== undefined && remaining < 50) { if (attempt === 3) throw new Error("GitHub rate limit is too low"); await sleep(2 ** attempt * 1000); continue; }
        return response;
      } catch (error) {
        if (error instanceof GraphqlResponseError && !isRateLimited(error)) throw error;
        if (attempt === 3) throw error;
        await sleep(2 ** attempt * 1000);
      }
    }
    throw new Error("GraphQL request failed");
  };
}

const yearWindow = (year: number) => ({ from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` });
const checkedAt = (now: Date) => new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString();
const generatedAt = () => checkedAt(new Date());

export async function assertSamlVisibility(request: GraphqlRequest, now = new Date()): Promise<SamlCanary> {
  const current = now.getUTCFullYear();
  let last: SamlCanary | undefined;
  for (const year of [current, current - 1]) {
    let response: unknown;
    try {
      response = await request<unknown>(CANARY_QUERY, { owner: "ethereum-optimism", name: "actions", login: "its-everdred", ...yearWindow(year) });
    } catch (error) {
      if (!(error instanceof GraphqlResponseError)) throw error;
      const detail = error.errors?.map((entry) => `${entry.type}: ${entry.message}`).join("; ") ?? "GitHub rejected the canary";
      const canary: SamlCanary = { ok: false, probeRepository: "ethereum-optimism/actions", sawRepository: false, sawOrgContribution: false, window: null, checkedAt: checkedAt(now), detail };
      throw new SamlCanaryError(canary);
    }
    const parsed = canarySchema.safeParse(response);
    if (!parsed.success) throw new Error(`GitHub canary response shape invalid: ${parsed.error.message}`);
    const repository = parsed.data.repository;
    const sawRepository = repository?.nameWithOwner === "ethereum-optimism/actions" && repository.isPrivate === false;
    const contributions = parsed.data.user.contributionsCollection.commitContributionsByRepository;
    const org = contributions.find((entry) => entry.repository.owner.login === "ethereum-optimism");
    const canary: SamlCanary = { ok: sawRepository && org !== undefined, probeRepository: "ethereum-optimism/actions", sawRepository,
      sawOrgContribution: org !== undefined, window: org ? String(year) : null, checkedAt: checkedAt(now),
      detail: org ? `${org.contributions.totalCount} commit contributions to ethereum-optimism in ${year}` : `No ethereum-optimism contributions visible in ${year}` };
    if (canary.ok) return canary;
    last = canary;
  }
  throw new SamlCanaryError(last ?? { ok: false, probeRepository: "ethereum-optimism/actions", sawRepository: false, sawOrgContribution: false, window: null, checkedAt: checkedAt(now), detail: "SAML canary failed" });
}

export async function fetchActorYear(request: GraphqlRequest, login: ActorLogin, year: number) {
  const response = await request<unknown>(CALENDAR_QUERY, { login, ...yearWindow(year) });
  const parsed = calendarSchema.safeParse(response);
  if (!parsed.success) throw new Error(`Calendar response shape invalid: ${parsed.error.message}`);
  const collection = parsed.data.user.contributionsCollection;
  const days = collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays)
    .filter((day) => day.date.startsWith(`${year}-`)).map((day) => ({ date: day.date, count: day.contributionCount }));
  return { total: collection.contributionCalendar.totalContributions, restricted: collection.restrictedContributionsCount, days };
}

const dateRange = (start: string, end: string) => {
  const result: string[] = []; const cursor = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))));
  const limit = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10))));
  while (cursor <= limit) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
};

export function mergeActorDays(actors: ActorCalendar[], windowStart: string, windowEnd: string) {
  const byLogin = new Map(actors.map((actor) => [actor.login, new Map(actor.days.map((day) => [day.date, day.count]))]));
  return dateRange(windowStart, windowEnd).map((date) => ({ date, e: byLogin.get("its-everdred")?.get(date) ?? 0, a: byLogin.get("its-applekid")?.get(date) ?? 0 }));
}

export async function fetchCalendarBundle(request: GraphqlRequest, opts: { windowStart?: string; windowEnd?: string; previous?: CalendarBundle } = {}) {
  const windowStart = opts.windowStart ?? "2010-01-01"; const windowEnd = opts.windowEnd ?? "2026-07-31";
  const canary = await assertSamlVisibility(request); const years = new Set(dateRange(windowStart, windowEnd).map((date) => date.slice(0, 4)));
  try {
    const actors: ActorCalendar[] = [];
    for (const login of ["its-everdred", "its-applekid"] as const) {
      const results = await Promise.all([...years].map((year) => fetchActorYear(request, login, Number(year))));
      const yearTotals = Object.fromEntries([...years].map((year, index) => [year, results[index]?.total ?? 0]));
      const days = new Map(results.flatMap((result) => result.days).map((day) => [day.date, day.count]));
      actors.push({ login, yearTotals, days: dateRange(windowStart, windowEnd).map((date) => ({ date, count: days.get(date) ?? 0 })) });
    }
    const combined = mergeActorDays(actors, windowStart, windowEnd); const combinedTotalNaive = actors.reduce((sum, actor) => sum + Object.values(actor.yearTotals).reduce((a, b) => a + b, 0), 0);
    if (combinedTotalNaive === 0 || actors.some((actor) => actor.days.length === 0)) throw new Error("GitHub returned an empty contribution calendar");
    return { source: "github-graphql", generatedAt: generatedAt(), windowStart, windowEnd, dayCount: combined.length, canary, actors, combined, combinedTotalNaive, combinedTotalDeduplicated: null, degraded: [] } satisfies CalendarBundle;
  } catch (error) {
    if (opts.previous) return { ...opts.previous, canary, degraded: [...new Set([...opts.previous.degraded, "calendar"])] };
    throw error;
  }
}

function fakeCanary(repository: unknown, owners: string[]): GraphqlRequest { return async <T>() => ({ repository, user: { contributionsCollection: { commitContributionsByRepository: owners.map((login) => ({ repository: { owner: { login } }, contributions: { totalCount: 1 } })) } }, rateLimit: { remaining: 5000 } } as T); }
async function selfCheck() {
  const sparse: ActorCalendar[] = [{ login: "its-everdred", yearTotals: {}, days: [{ date: "2021-01-02", count: 2 }] }, { login: "its-applekid", yearTotals: {}, days: [] }];
  const merged = mergeActorDays(sparse, "2021-01-01", "2026-07-31"); if (merged.length !== 2038 || merged[1]?.e !== 2) throw new Error("calendar merge self-check failed");
  for (const owners of [[], []]) { try { await assertSamlVisibility(fakeCanary({ nameWithOwner: "ethereum-optimism/actions", isPrivate: false }, owners), new Date("2026-08-01T00:00:00Z")); throw new Error("canary accepted invisible organization"); } catch (error) { if (!(error instanceof SamlCanaryError)) throw error; } }
}

async function main() { try { if (process.argv.includes("--self-check")) { await selfCheck(); return; } const token = process.env.CONTRIB_TOKEN; if (!token) throw new Error("CONTRIB_TOKEN is required (GATE-003)"); const request = createContribClient(token); if (process.argv.includes("--canary")) { console.log(JSON.stringify(await assertSamlVisibility(request))); return; } console.log(JSON.stringify(await fetchCalendarBundle(request))); } catch (error) { if (error instanceof SamlCanaryError) { console.error(error.canary.detail); process.exitCode = 1; return; } console.error(error instanceof Error ? error.message : "Pipeline failed"); process.exitCode = 1; } }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
