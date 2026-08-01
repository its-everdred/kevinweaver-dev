import { graphql, GraphqlResponseError } from "@octokit/graphql";
import { z } from "zod";
import { pathToFileURL } from "node:url";

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
  combined: { date: string; e: number; a: number }[]; combinedTotalNaive: number;
  combinedTotalDeduplicated: number | null; degraded: string[];
}

const CANARY_QUERY = `query SamlCanary($owner: String!, $name: String!, $login: String!, $from: DateTime!, $to: DateTime!) {
  repository(owner: $owner, name: $name) { nameWithOwner isPrivate stargazerCount }
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    commitContributionsByRepository(maxRepositories: 100) { repository { owner { login } } contributions { totalCount } }
  } } rateLimit { cost remaining }
}`;
const CALENDAR_QUERY = `query Cal($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    restrictedContributionsCount contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
  } } rateLimit { cost remaining }
}`;
const DEFAULT_START = "2021-01-01";
const DEFAULT_END = "2026-07-31";
const ACTORS: readonly ActorLogin[] = ["its-everdred", "its-applekid"];

const canarySchema = z.object({
  repository: z.object({ nameWithOwner: z.string(), isPrivate: z.boolean() }).nullable(),
  user: z.object({ contributionsCollection: z.object({
    commitContributionsByRepository: z.array(z.object({ repository: z.object({ owner: z.object({ login: z.string() }) }), contributions: z.object({ totalCount: z.number() }) }))
  }) }), rateLimit: z.object({ remaining: z.number() })
});
const calendarSchema = z.object({ user: z.object({ contributionsCollection: z.object({
  restrictedContributionsCount: z.number().int().nonnegative(), contributionCalendar: z.object({
    totalContributions: z.number().int().nonnegative(), weeks: z.array(z.object({ contributionDays: z.array(z.object({ date: z.string(), contributionCount: z.number().int().nonnegative() })) }))
  })
}) }), rateLimit: z.object({ remaining: z.number() }) });

export class SamlCanaryError extends Error {
  readonly canary: SamlCanary;
  constructor(canary: SamlCanary) { super(canary.detail); this.name = "SamlCanaryError"; this.canary = canary; }
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const isRateLimited = (error: unknown) => error instanceof GraphqlResponseError && error.errors?.some((item) => item.type === "RATE_LIMITED");

export function createContribClient(token: string): GraphqlRequest {
  if (!token) throw new Error("CONTRIB_TOKEN is required (GATE-003)");
  const client = graphql.defaults({ headers: { authorization: `token ${token}`, "user-agent": "kevinweaver-dev-pipeline" } });
  return async <T>(query: string, variables: Record<string, unknown> = {}) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result = await client<T>(query, variables);
        const remaining = (result as { rateLimit?: { remaining?: number } }).rateLimit?.remaining;
        if (remaining !== undefined && remaining < 50) {
          if (attempt === 3) throw new Error("GitHub rate limit is too low");
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        return result;
      } catch (error) {
        if (error instanceof GraphqlResponseError && !isRateLimited(error)) throw error;
        if (attempt === 3) throw error;
        await sleep(1000 * 2 ** attempt);
      }
    }
    throw new Error("GraphQL request exhausted retries");
  };
}

const instant = (date: string, end = false) => `${date}T${end ? "23:59:59" : "00:00:00"}Z`;
const isoSecond = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
const yearBounds = (year: number) => ({ from: instant(`${year}-01-01`), to: instant(`${year}-12-31`, true) });

export async function assertSamlVisibility(request: GraphqlRequest, now = new Date()): Promise<SamlCanary> {
  const checkedAt = isoSecond(now);
  const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
  let last: SamlCanary | undefined;
  for (const year of years) {
    try {
      const raw = await request(CANARY_QUERY, { owner: "ethereum-optimism", name: "actions", login: "its-everdred", ...yearBounds(year) });
      const data = canarySchema.parse(raw);
      const sawRepository = data.repository?.nameWithOwner === "ethereum-optimism/actions" && data.repository.isPrivate === false;
      const entry = data.user.contributionsCollection.commitContributionsByRepository.find((item) => item.repository.owner.login === "ethereum-optimism");
      const sawOrgContribution = entry !== undefined;
      last = { ok: sawRepository && sawOrgContribution, probeRepository: "ethereum-optimism/actions", sawRepository, sawOrgContribution, window: sawOrgContribution ? String(year) : null, checkedAt, detail: sawOrgContribution ? `${entry.contributions.totalCount} commit contributions to ethereum-optimism in ${year}` : `No ethereum-optimism contribution in ${year}` };
      if (last.ok) return last;
    } catch (error) {
      if (error instanceof GraphqlResponseError && error.errors?.some((item) => item.type === "FORBIDDEN")) {
        last = { ok: false, probeRepository: "ethereum-optimism/actions", sawRepository: false, sawOrgContribution: false, window: null, checkedAt, detail: "SAML authorization is required for ethereum-optimism" };
      } else throw error;
    }
  }
  throw new SamlCanaryError(last ?? { ok: false, probeRepository: "ethereum-optimism/actions", sawRepository: false, sawOrgContribution: false, window: null, checkedAt, detail: "SAML visibility check failed" });
}

export async function fetchActorYear(request: GraphqlRequest, login: ActorLogin, year: number) {
  const raw = await request(CALENDAR_QUERY, { login, ...yearBounds(year) });
  const data = calendarSchema.parse(raw).user.contributionsCollection;
  const days = data.contributionCalendar.weeks.flatMap((week) => week.contributionDays).filter((day) => day.date.startsWith(`${year}-`));
  return { total: data.contributionCalendar.totalContributions, restricted: data.restrictedContributionsCount, days };
}

const dates = (from: string, to: string) => {
  const result: string[] = []; const cursor = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))); const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  while (cursor.getTime() <= end) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
};

export function mergeActorDays(actors: ActorCalendar[], windowStart: string, windowEnd: string) {
  const all = dates(windowStart, windowEnd); const maps = actors.map((actor) => new Map(actor.days.map((day) => [day.date, day.count])));
  return all.map((date) => ({ date, e: maps[0]?.get(date) ?? 0, a: maps[1]?.get(date) ?? 0 }));
}

export async function fetchCalendarBundle(request: GraphqlRequest, opts: { windowStart?: string; windowEnd?: string; previous?: CalendarBundle } = {}): Promise<CalendarBundle> {
  const windowStart = opts.windowStart ?? DEFAULT_START; const windowEnd = opts.windowEnd ?? DEFAULT_END; const canary = await assertSamlVisibility(request); const years = [...new Set(dates(windowStart, windowEnd).map((date) => Number(date.slice(0, 4))))];
  try {
    const actors = await Promise.all(ACTORS.map(async (login) => { const results = await Promise.all(years.map((year) => fetchActorYear(request, login, year))); const dayMap = new Map(results.flatMap((item) => item.days).map((day) => [day.date, day.contributionCount])); return { login, yearTotals: Object.fromEntries(years.map((year, index) => [String(year), results[index]?.total ?? 0])), days: dates(windowStart, windowEnd).map((date) => ({ date, count: dayMap.get(date) ?? 0 })) }; }));
    const combined = mergeActorDays(actors, windowStart, windowEnd); const combinedTotalNaive = actors.reduce((sum, actor) => sum + Object.values(actor.yearTotals).reduce((yearSum, total) => yearSum + total, 0), 0);
    if (combinedTotalNaive === 0 || actors.some((actor) => actor.days.length === 0)) throw new Error("GitHub returned an empty contribution calendar");
    return { source: "github-graphql", generatedAt: isoSecond(new Date()), windowStart, windowEnd, dayCount: combined.length, canary, actors, combined, combinedTotalNaive, combinedTotalDeduplicated: null, degraded: [] };
  } catch (error) { if (opts.previous) return { ...opts.previous, canary, degraded: [...new Set([...opts.previous.degraded, "calendar"])] }; throw error; }
}

const selfCheck = async () => {
  const sparse: ActorCalendar[] = ACTORS.map((login) => ({ login, yearTotals: {}, days: [{ date: "2021-01-01", count: 1 }] }));
  if (mergeActorDays(sparse, DEFAULT_START, DEFAULT_END).length !== 2038) throw new Error("dense merge failed");
  const fake: GraphqlRequest = async <T>() => ({ repository: null, user: { contributionsCollection: { commitContributionsByRepository: [] } }, rateLimit: { remaining: 5000 } } as T);
  try { await assertSamlVisibility(fake, new Date("2026-07-31T00:00:00Z")); throw new Error("canary accepted null repository"); } catch (error) { if (!(error instanceof SamlCanaryError)) throw error; }
};

const main = async () => { if (process.argv.includes("--self-check")) return selfCheck(); const request = createContribClient(process.env.CONTRIB_TOKEN ?? ""); if (process.argv.includes("--canary")) { console.log(JSON.stringify(await assertSamlVisibility(request))); return; } if (process.argv.includes("--json")) { console.log(JSON.stringify(await fetchCalendarBundle(request))); return; } throw new Error("Use --json, --canary, or --self-check"); };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => { if (error instanceof SamlCanaryError) process.exitCode = 1; else { console.error(error instanceof Error ? error.message : "pipeline failed"); process.exitCode = 1; } });
