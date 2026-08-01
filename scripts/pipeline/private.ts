import { pathToFileURL } from "node:url";
import { z } from "zod";
// @ts-expect-error Node 24 resolves this runtime import with its .ts extension.
import { assertSamlVisibility, createContribClient, type ActorLogin, type GraphqlRequest } from "./calendar.ts";

export interface ActorPrivateSeries { login: ActorLogin; months: number[]; hasAnyRestrictedContributions: boolean; total: number }
export interface PrivateAggregate { source: "github-graphql"; generatedAt: string; pStart: string; monthCount: number; actors: ActorPrivateSeries[]; p: number[]; viewerLogin: string; degraded: string[] }

const QUERY = `query PrivateAgg($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) { contributionsCollection(from: $from, to: $to) { restrictedContributionsCount hasAnyRestrictedContributions } } rateLimit { remaining } }`;
const responseSchema = z.object({ user: z.object({ contributionsCollection: z.object({ restrictedContributionsCount: z.number().int().nonnegative(), hasAnyRestrictedContributions: z.boolean() }) }), rateLimit: z.object({ remaining: z.number().int() }) });
const secondResolution = (date: Date) => new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();

const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString().replace(".000Z", "Z");
export function monthWindows(pStart: string, monthCount: number) {
  const [year, month] = pStart.split("-").map(Number); if (!year || !month || monthCount < 1) throw new Error("Invalid month window");
  return Array.from({ length: monthCount }, (_, index) => { const date = new Date(Date.UTC(year, month - 1 + index, 1)); const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1; const key = `${y}-${String(m).padStart(2, "0")}`; return { key, from: `${key}-01T00:00:00Z`, to: monthEnd(y, m) }; });
}

export async function fetchPrivateAggregate(request: GraphqlRequest, opts: { pStart?: string; monthCount?: number } = {}) {
  await assertSamlVisibility(request);
  const pStart = opts.pStart ?? "2021-01"; const monthCount = opts.monthCount ?? 67; const windows = monthWindows(pStart, monthCount);
  const actors: ActorPrivateSeries[] = [];
  for (const login of ["its-everdred", "its-applekid"] as const) {
    const values = await Promise.all(windows.map(async (window) => { const response = await request<unknown>(QUERY, { login, from: window.from, to: window.to }); const parsed = responseSchema.safeParse(response); if (!parsed.success) throw new Error(`Private response shape invalid: ${parsed.error.message}`); return parsed.data.user.contributionsCollection; }));
    const months = values.map((value) => value.restrictedContributionsCount); actors.push({ login, months, hasAnyRestrictedContributions: values.some((value) => value.hasAnyRestrictedContributions), total: months.reduce((sum, value) => sum + value, 0) });
  }
  const p = windows.map((_, index) => actors.reduce((sum, actor) => sum + (actor.months[index] ?? 0), 0));
  const subject = actors.find((actor) => actor.login === "its-everdred"); if (!subject || subject.total <= 0 || !subject.hasAnyRestrictedContributions) throw new Error("its-everdred restricted contribution invariant failed");
  return { source: "github-graphql", generatedAt: secondResolution(new Date()), pStart, monthCount, actors, p, viewerLogin: "its-everdred", degraded: [] } satisfies PrivateAggregate;
}

async function selfCheck() {
  const windows = monthWindows("2021-01", 67); if (windows[0]?.key !== "2021-01" || windows.at(-1)?.key !== "2026-07" || windows.at(-1)?.to !== "2026-07-31T23:59:59Z") throw new Error("month window self-check failed");
  const fixture = [21,12,21,23,18,6,0,2,2,0,0,0,0,0,0,0,1,0,2,4,8,15,35,23,77,45,110,76,62,24,75,216,90,122,91,42,121,278,258,200,110,126,169,208,158,290,152,292,213,228,91,72,42,33,34,68,65,83,33,36,23,25,40,101,68,109,122]; if (fixture.length !== 67 || fixture.some((value) => value < 0 || !Number.isInteger(value))) throw new Error("private fixture self-check failed");
  const fake: GraphqlRequest = async <T>(query: string) => query.includes("SamlCanary")
    ? ({ repository: { nameWithOwner: "ethereum-optimism/actions", isPrivate: false }, user: { contributionsCollection: { commitContributionsByRepository: [{ repository: { owner: { login: "ethereum-optimism" } }, contributions: { totalCount: 1 } }] } }, rateLimit: { remaining: 5000 } } as T)
    : ({ user: { contributionsCollection: { restrictedContributionsCount: 1, hasAnyRestrictedContributions: true } }, rateLimit: { remaining: 5000 } } as T);
  const aggregate = await fetchPrivateAggregate(fake, { monthCount: 1 }); if (aggregate.actors[0]?.hasAnyRestrictedContributions !== true) throw new Error("private flag self-check failed");
}
async function main() { try { if (process.argv.includes("--self-check")) { await selfCheck(); return; } const token = process.env.CONTRIB_TOKEN; if (!token) throw new Error("CONTRIB_TOKEN is required (GATE-003)"); console.log(JSON.stringify(await fetchPrivateAggregate(createContribClient(token)))); } catch (error) { console.error(error instanceof Error ? error.message : "Pipeline failed"); process.exitCode = 1; } }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
