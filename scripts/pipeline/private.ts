import { pathToFileURL } from "node:url";
import { z } from "zod";
export type GraphqlRequest = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
export type ActorLogin = "its-everdred" | "its-applekid";
type CanaryCheck = (request: GraphqlRequest) => Promise<unknown>;

export interface ActorPrivateSeries { login: ActorLogin; months: number[]; hasAnyRestrictedContributions: boolean; total: number }
export interface PrivateAggregate { source: "github-graphql"; generatedAt: string; pStart: string; monthCount: number; actors: ActorPrivateSeries[]; p: number[]; viewerLogin: string; degraded: string[] }
const PRIVATE_QUERY = `query PrivateAgg($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) { contributionsCollection(from: $from, to: $to) { restrictedContributionsCount hasAnyRestrictedContributions } } rateLimit { cost remaining } }`;
const privateSchema = z.object({ user: z.object({ contributionsCollection: z.object({ restrictedContributionsCount: z.number().int().nonnegative(), hasAnyRestrictedContributions: z.boolean() }) }), rateLimit: z.object({ remaining: z.number() }) });
const actors: readonly ActorLogin[] = ["its-everdred", "its-applekid"];
const isoSecond = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString().replace(".000Z", "Z");

export function monthWindows(pStart: string, monthCount: number) {
  const [startYear = 0, startMonth = 1] = pStart.split("-").map(Number); return Array.from({ length: monthCount }, (_, index) => { const month = startMonth - 1 + index; const year = startYear + Math.floor(month / 12); const monthNumber = (month % 12) + 1; const key = `${year}-${String(monthNumber).padStart(2, "0")}`; return { key, from: `${key}-01T00:00:00Z`, to: monthEnd(year, monthNumber) }; });
}

export async function fetchPrivateAggregate(request: GraphqlRequest, opts: { pStart?: string; monthCount?: number } = {}): Promise<PrivateAggregate> {
  const { assertSamlVisibility } = await import(new URL("./calendar.ts", import.meta.url).href) as { assertSamlVisibility: CanaryCheck }; await assertSamlVisibility(request); const pStart = opts.pStart ?? "2021-01"; const monthCount = opts.monthCount ?? 67; const windows = monthWindows(pStart, monthCount);
  const result = await Promise.all(actors.map(async (login) => { const values = await Promise.all(windows.map(async (window) => { const raw = await request(PRIVATE_QUERY, { login, from: window.from, to: window.to }); return privateSchema.parse(raw).user.contributionsCollection; })); const months = values.map((value) => value.restrictedContributionsCount); return { login, months, hasAnyRestrictedContributions: values.some((value) => value.hasAnyRestrictedContributions), total: months.reduce((sum, value) => sum + value, 0) }; }));
  const p = windows.map((_, index) => result.reduce((sum, actor) => sum + (actor.months[index] ?? 0), 0)); const first = result[0]; if (first && (first.total <= 0 || !first.hasAnyRestrictedContributions)) throw new Error("its-everdred restricted contribution invariant failed");
  return { source: "github-graphql", generatedAt: isoSecond(new Date()), pStart, monthCount, actors: result, p, viewerLogin: "its-everdred", degraded: [] };
}

const selfCheck = async () => { const windows = monthWindows("2021-01", 67); if (windows[0]?.key !== "2021-01" || windows.at(-1)?.key !== "2026-07" || windows.some((window) => !window.to.endsWith("Z"))) throw new Error("month window alignment failed"); const fake: GraphqlRequest = async <T>(query: string) => query.includes("SamlCanary") ? ({ repository: { nameWithOwner: "ethereum-optimism/actions", isPrivate: false }, user: { contributionsCollection: { commitContributionsByRepository: [{ repository: { owner: { login: "ethereum-optimism" } }, contributions: { totalCount: 1 } }] } }, rateLimit: { remaining: 5000 } } as T) : ({ user: { contributionsCollection: { restrictedContributionsCount: 1, hasAnyRestrictedContributions: true } }, rateLimit: { remaining: 5000 } } as T); const aggregate = await fetchPrivateAggregate(fake); if (aggregate.p.length !== 67 || aggregate.actors[0]?.total !== 67) throw new Error("private aggregate invariant failed"); };
const main = async () => { if (process.argv.includes("--self-check")) return selfCheck(); const { createContribClient } = await import(new URL("./calendar.ts", import.meta.url).href) as { createContribClient: (token: string) => GraphqlRequest }; const request = createContribClient(process.env.CONTRIB_TOKEN ?? ""); if (process.argv.includes("--json")) { console.log(JSON.stringify(await fetchPrivateAggregate(request))); return; } throw new Error("Use --json or --self-check"); };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "pipeline failed"); process.exitCode = 1; });
