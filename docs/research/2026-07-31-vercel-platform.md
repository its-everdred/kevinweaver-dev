# Vercel Platform Track — Measured Research

Date: 2026-07-31
Scope: kevinweaver.dev hosting. Site stays on Vercel; no infra change.
Legend: **(M)** = measured this session (command/URL given). **(I)** = inference, reasoned from measured facts.

---

## 0. Headline

The live production deployment is a **zombie from 2021-05-31**: static assets still serve fine, but
its serverless functions are **dead** — `GET /api/hello` returns `404` with
`x-vercel-error: FUNCTION_RUNTIME_DEPRECATED` **(M)**. Vercel retired the Node runtime that
deployment was built against. Nothing dynamic can be added to this site without a fresh build, and a
fresh build of the current tree (Next 10.1.3, no `next.config.js`, so webpack 4) on the only Node
versions Vercel now offers (24/22/20) will almost certainly fail **(I)**. The Vercel↔GitHub
connection is still live and will fire on the next push.

---

## 1. What the live deployment tells us (no credentials needed)

### Identity of the deployment

| Fact | Value | How measured |
|---|---|---|
| Server | `server: Vercel`, region `sfo1` | `curl -sSI https://www.kevinweaver.dev/` **(M)** |
| Apex behaviour | `https://kevinweaver.dev/` → `HTTP/2 308` → `location: https://www.kevinweaver.dev/` | `curl -sSI https://kevinweaver.dev/` **(M)** |
| Vercel project name | `kevinweaver-dev` | `curl -sSI https://kevinweaver-dev.vercel.app/` → `200`, identical `etag` `W/"08a1ed9ab5faf8b9…"` to `www.kevinweaver.dev` **(M)** |
| Vercel scope / team slug | `kevinweaver` | GitHub deployment status `environment_url: https://kevinweaver-dev-7cfb5y7ym-kevinweaver.vercel.app` **(M)** |
| Last production deploy | `2021-05-31T18:13:24Z`, sha `cefcffb` (= current `main` HEAD) | `gh api repos/its-everdred/kevinweaver-dev/deployments` **(M)** |
| Git integration | `vercel[bot]` (GitHub App id 8329) created 14 GitHub Deployments — 7 `Production`, 7 `Preview` | same **(M)** |
| HSTS | `strict-transport-security: max-age=63072000` on apex+www; `includeSubDomains; preload` on `*.vercel.app` | `curl -sSI` **(M)** |

`kevinweaver-dev-its-everdred.vercel.app` and `kevinweaver.vercel.app` both return
`x-vercel-error: DEPLOYMENT_NOT_FOUND` **(M)** — the scope is `kevinweaver`, not `its-everdred`.

### Build fingerprint → deployed Next.js version

```
$ curl -sS https://www.kevinweaver.dev/ | grep -oE '/_next/static/[^"]*'
/_next/static/chunks/f6078781a05fe1bcb0902d23dbbb2662c8d200b3.862422b2d088409d6c1d.js
/_next/static/chunks/framework.e3de07479da4f2477dea.js
/_next/static/chunks/main-11fbeffca3be6fa5540b.js
/_next/static/chunks/pages/_app-a0bbfcb3db0010a74dc6.js
/_next/static/chunks/pages/index-abc6bfb358c039cb94f4.js
/_next/static/chunks/polyfills-aa54647e89713304033b.js
/_next/static/chunks/webpack-50bee04d1dc61f8adf5b.js
/_next/static/css/1b9cb1b8c371247bc820.css
/_next/static/kryIyd1UtaXJNmg4JeoGR/_buildManifest.js
```

`__NEXT_DATA__` = `{"props":{"pageProps":{}},"page":"/","query":{},"buildId":"kryIyd1UtaXJNmg4JeoGR","nextExport":true,"autoExport":true,"isFallback":false}` **(M)**

**Deployed Next version = 10.1.3 (M)**, proven by grepping the served runtime chunk:

```
$ curl -sS https://www.kevinweaver.dev/_next/static/chunks/main-11fbeffca3be6fa5540b.js \
  | grep -oE 'version:"[0-9]+\.[0-9]+\.[0-9]+[^"]*"'
"10.1.3"
```

This **exactly matches the repo** — `package-lock.json` line 7177 and `yarn.lock` line 1810 both
resolve `next` to `10.1.3` **(M)**. So the live site is a faithful build of `main` HEAD. No drift.

### The functions are dead

```
$ curl -sS -D- https://www.kevinweaver.dev/api/hello
HTTP/2 404
x-matched-path: /api/hello
x-vercel-cache: MISS
x-vercel-error: FUNCTION_RUNTIME_DEPRECATED
```
**(M)** — `pages/api/hello.js` exists in the repo and was built into a Lambda in 2021. Vercel's
documented resolution for `*_RUNTIME_DEPRECATED` is "redeploy the project to automatically upgrade
to the latest supported runtime version" (https://vercel.com/docs/errors/middleware_runtime_deprecated).
Static assets are unaffected because they are plain CDN objects.

### Cache/header notes

- `last-modified` is **CDN cache-fill time, not deploy time** **(M)**: for `main-*.js`,
  `date` (Jul 31 23:36:16) − `age` (1,303,391 s) = `last-modified` (Jul 16 21:33:04) exactly. Do not
  read deploy dates off it.
- HTML: `cache-control: public, max-age=0, must-revalidate`, `x-vercel-cache: HIT`.
- `/_next/static/*`: `cache-control: public,max-age=31536000,immutable`.
- `404` page is prerendered and served with `x-matched-path: /404` **(M)**.

### Content gaps visible from the served HTML (relevant to the redesign)

`<title>Hi.</title>`, `next-head-count: 4`, and **no** `<meta name="description">`, **no** OG/Twitter
tags, **no** canonical, **no** favicon `<link>`, **no** `lang` attribute, **no** analytics script **(M)**.
Total HTML 7,547 bytes. Styling is `styled-jsx` inline `<style>` plus one Tailwind CSS chunk.

---

## 2. Vercel CLI state locally

| Check | Result |
|---|---|
| `which vercel` | `vercel not found` **(M)** |
| `npm ls -g --depth=0` | `@openai/codex`, `aiur-claude`, `aiur-cli`, `corepack`, `npm`, `opencode-ai` — no `vercel` **(M)** |
| `ls /home/everdred/github/everdred/kevinweaver-dev/.vercel` | does not exist **(M)** |
| `ls ~/.vercel`, `ls ~/.local/share/com.vercel.cli` | neither exists → CLI has never been authenticated on this machine **(M)** |
| `.gitignore` | already contains `.vercel` (last line) **(M)** — good, linking won't dirty the tree |
| Latest CLI on npm | `vercel@58.4.4` (`npm view vercel version`) **(M)** |
| Local Node | `v24.18.0` (mise), npm `11.16.0`, yarn `1.22.22`, pnpm `11.18.0` **(M)** |

I deliberately did **not** run `npx vercel --version` — it would install ~50 MB into the npm cache
as a side effect. Version confirmed via `npm view` instead.

**What linking requires from the user (I):**
1. `npx vercel@latest login` — opens a browser, requires the user's GitHub/email auth. Cannot be
   done by an agent.
2. `npx vercel@latest link` — interactive: choose scope `kevinweaver`, choose existing project
   `kevinweaver-dev`. Non-interactive equivalent:
   `npx vercel link --yes --scope kevinweaver --project kevinweaver-dev`.
3. Writes `.vercel/project.json` (`orgId` + `projectId`) — already gitignored.
4. For CI/agent use, the user must instead mint a token at
   https://vercel.com/account/tokens and export `VERCEL_TOKEN`, plus `VERCEL_ORG_ID` /
   `VERCEL_PROJECT_ID`. **This is the only human-blocking step in this whole track.**

**Do we need it?** For the plan as scoped — **no**. Git-push deploys already work (§9). The CLI is
only needed to (a) inspect/change project settings such as the Node version, (b) `vercel env add`
a `GITHUB_TOKEN`/`CRON_SECRET`, (c) run `vercel build` locally to reproduce a build failure. (a) and
(b) can also be done in the dashboard.

---

## 3. Hobby vs Pro in 2026 — exact numbers

Source: https://vercel.com/docs/limits (page `last_updated: 2026-07-01`),
https://vercel.com/docs/plans/hobby (`2026-06-16`),
https://vercel.com/docs/limits/fair-use-guidelines (`2026-06-16`). All **(M)** by fetch.

### General limits

| | Hobby | Pro |
|---|---|---|
| Projects | 200 | Unlimited |
| Deployments created per day | 100 | 6,000 |
| Deployments per hour | 100 | 450 |
| **Concurrent deployments (builds)** | **1** | up to 500 (3 if on-demand off) |
| Build time per deployment | 45 min (all plans) | 45 min |
| Build vCPUs / memory / disk | **2 vCPU / 8 GB / 32 GB** | 4 vCPU (Elastic 4–30) / 8–60 GB / 32–64 GB |
| Cron jobs per project | 100 | 100 |
| Deploy hooks per project | 5 | 5 |
| Deploy hook triggers | 60/hour/project | 60/hour/project |
| Domains per project | 50 | Unlimited |
| Routes per deployment | 2,048 | 2,048 |
| Env vars per environment | 1,000, 64 KB total | same |
| Runtime log retention | **1 hour** | 1 day |
| Build cache | 1 GB, retained 1 month | same |
| Static file upload (CLI) | 100 MB | 1 GB |
| Files per CLI deployment | 15,000 source files | same |

**Build minutes are not metered on Hobby (M).** The Hobby included-usage table has no build-minute
line; `$0.0035/CPU-minute` applies only to Pro/Enterprise Elastic/Enhanced/Turbo machines
(https://vercel.com/docs/builds/managing-builds). Hobby gets the fixed 2-vCPU Standard machine with
1 concurrent build and no per-minute charge. **The 100-deploys/day and 100-builds/hour rate limits
are the real ceiling, not minutes.**

### Monthly included usage (Hobby)

| Resource | Hobby included |
|---|---|
| Fast Data Transfer (bandwidth) | **100 GB** |
| Fast Origin Transfer | up to 10 GB |
| Edge Requests | up to **1,000,000** |
| Function Invocations | **1,000,000** |
| Active CPU | 4 CPU-hrs |
| Provisioned Memory | 360 GB-hrs |
| Image transformations | **5,000 / month** |
| Image cache reads | 300,000 |
| Image cache writes | 100,000 |
| Global Config reads | 100,000 |
| Global Config writes | **100** |
| Web Analytics events | 50,000 |
| Speed Insights events | 10,000 (1 project) |

### Function duration — **this project is on the LEGACY table**

Two different limits are documented and it matters which one applies:

> "If you have an existing project, **deployed to Vercel before April 23rd 2025** and **not using
> Fluid compute**, Vercel Functions have the following defaults and maximum limits…
> Hobby: **default 10s, maximum 60s**" — https://vercel.com/docs/limits **(M)**

vs. the Hobby-vs-Pro table: "Vercel Function maximum duration — Hobby **300s (5 minutes)**"
(fluid compute) — https://vercel.com/docs/plans/hobby **(M)**.

The `kevinweaver-dev` project was created in 2021 **(M** — 2021 GitHub deployments**)**, i.e. well
before 2025-04-23. **(I)** Unless Fluid compute is explicitly enabled (`"fluid": true` in
`vercel.json`, or the project toggle), any cron/API route on this project caps at **60 s**, and
defaults to **10 s**. A GitHub-graph regeneration job that walks 5 years of contributions will not
reliably finish in 60 s. **This is the single strongest technical argument against strategy (b) in §5.**

### Middleware

Edge-runtime middleware "can use no more than **50 ms of CPU time on average**"
(https://vercel.com/docs/limits/fair-use-guidelines) **(M)**. There is no separate middleware
invocation allowance on Hobby; middleware requests count as Edge Requests. **We need no middleware**
for this site.

### Image Optimization

Hobby: 5K transformations / 300K cache reads / 100K cache writes per month, free
(https://vercel.com/docs/image-optimization/limits-and-pricing) **(M)**. Max transformed image 10 MB;
source max 8192×8192; only jpeg/png/webp/avif are optimized. On overage: **new** images return HTTP
402 `DEPLOYMENT_DISABLED` and `next/image` falls back to `alt` text; already-cached images keep
working; you are not charged **(M)**.
**(I)** The gruvbox terminal design is text/SVG/canvas — 5K transformations/month is not a
constraint. Avoid `next/image` for anything hot anyway; ship SVG.

### ISR

https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing (`2026-07-14`) **(M)**:
reads/writes metered in 8 KB units, priced regionally, `$0.0004/1K` reads and `$0.004/1K` writes on
Pro. "There is no limit on storage for ISR… unless it goes unaccessed for 31 days."
**ISR does not appear anywhere in the Hobby included-usage table (M)** → **(I)** ISR reads/writes are
effectively unmetered/free on Hobby. Open question flagged below.

### Recently changed — flag these

- **Edge Config is now "Global Config" (M).** The docs still say "formerly known as Edge Config
  Reads/Writes". Any pre-2026 blog post or LLM memory referring to `@vercel/edge-config` limits is
  stale nomenclature.
- **Vercel KV and Vercel Postgres no longer exist as first-party products (M).** `/docs/storage`
  lists exactly two first-party stores: Blob and Global Config. Redis/Postgres are Marketplace
  (Upstash/Neon/Supabase).
- **Fluid compute is the default compute model**; `/docs/functions/usage-and-pricing` is now titled
  "Fluid compute pricing" and bills Active CPU + Provisioned Memory, not GB-seconds **(M)**.
- **Node.js 20 is deprecated as of 2026-10-01** (https://vercel.com/changelog/node-js-20-is-being-deprecated) **(M)**.
- **`vercel.ts`** is now supported alongside `vercel.json` for programmatic build-time config **(M)**.
- Hobby → Pro is **$20/user/month** for Developer seats; Viewer seats free **(M)**.

### The Hobby commercial-use rule (read this before shipping)

> "**Hobby teams are restricted to non-commercial personal use only.** … Commercial usage is defined
> as any Deployment that is used for the purpose of financial gain of anyone involved in any part of
> the production of the project… Examples… Any method of requesting or processing payment…
> Advertising the sale of a product or service… Receiving payment to create, update, or host the
> site… Affiliate linking is the primary purpose… The inclusion of advertisements… **Asking for
> Donations fall under commercial usage.**"
> — https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage **(M)**

**(I)** A personal résumé site is the canonical Hobby use case and is fine. The rules that would
break it: adding a donate/sponsor button, ads, affiliate links, or a "hire me — $X/hr" storefront.
Keep the GitHub Sponsors / ETH-address urge out of scope, or budget $20/mo for Pro.

### What happens when Hobby limits are hit

> "In most cases, if you exceed your usage limits on the Hobby plan, you will have to **wait until
> 30 days have passed** before you can use the feature again." — https://vercel.com/docs/plans/hobby **(M)**

Blob specifically: "you will not be able to access Vercel Blob if limits are exceeded… wait until 30
days have passed" **(M)**. Image optimization degrades gracefully (402 + alt text) rather than taking
the site down **(M)**. **(I)** The catastrophic failure mode for a Hobby portfolio site is
bandwidth: 100 GB Fast Data Transfer. A 250 KB bundle + ~500 KB of page weight = ~750 KB/visit →
~133,000 visits/month before you hit it. An HN front page will not do that. Safe.

---

## 4. Vercel Cron on Hobby — the exact answer

Source: https://vercel.com/docs/cron-jobs/usage-and-pricing (`2026-06-16`) **(M)**.

| | Cron jobs per project | Minimum interval | Scheduling precision |
|---|---|---|---|
| **Hobby** | **100** | **Once per day** | **Per-hour (±59 min)** |
| Pro | 100 | Once per minute | Per-minute |
| Enterprise | 100 | Once per minute | Per-minute |

> "Hobby accounts are limited to cron jobs that run **once per day**. Cron expressions that would run
> more frequently **will fail during deployment**" with the error
> *"Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day."*
> …"a cron job configured as `0 1 * * *` (every day at 1 am) will trigger anywhere between 1:00 am
> and 1:59 am." **(M)**

Other measured cron facts:
- Crons are configured in `vercel.json` under `crons: [{ path, schedule }]`; `path` must start with
  `/`, max 512 chars; `schedule` max 256 chars. **(M)**
- Vercel makes an HTTP **GET** to the **production deployment URL** only. Preview deployments do not
  run crons. **(M)**
- Timezone is **always UTC**. No `MON`/`JAN` aliases. Cannot set day-of-month and day-of-week
  simultaneously. **(M)**
- User agent is `vercel-cron/1.0`; header `x-vercel-cron-schedule` carries the triggering expression. **(M)**
- Secure with a `CRON_SECRET` env var → Vercel sends `Authorization: Bearer <CRON_SECRET>`. **(M)**
- **"Vercel will not retry an invocation if a cron job fails."** Delivery is best-effort and may
  also **duplicate**. Design idempotently. **(M)**
- Cron jobs **do not follow redirects** — a 3xx ends the invocation. **(M)** (Relevant: our apex 308s
  to www; point the cron at a path, not an absolute URL, and it'll be fine.)
- Disabled cron jobs still count toward the 100 limit. **(M)**
- Instant Rollback does **not** update active cron jobs. **(M)**

**Verdict: yes, scheduled regeneration can run on Vercel Hobby — but only once per day, at a
random minute inside the chosen hour, with no retry on failure, and (for this pre-2025 project)
capped at 60 s of execution.**

**(I) Known workaround, not recommended:** the "more than once per day" check is per-expression, so
N separate entries (`0 0 * * *`, `0 6 * * *`, `0 12 * * *`, `0 18 * * *`) would each individually
pass validation and give 4×/day. This is untested here and is arguably "circumventing… Vercel's
limits", which the fair-use page explicitly calls a violation **(M)**. Do not plan on it.

---

## 5. Three data-refresh strategies for the ~200–250 KB activity bundle

Constraints that decide this: live view is **cut from scope**, so freshness is soft; the animation
plays **backwards from newest**, so the *recent* slice must be first-byte fast; the repo is
**public** so GitHub Actions minutes are **free** ("GitHub Actions usage is free for … public
repositories that use standard GitHub-hosted runners" —
https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions **(M)**).

### (a) GitHub Actions scheduled workflow → commit bundle → Vercel auto-deploys

| Axis | Assessment |
|---|---|
| Cost | **$0.** Actions free on public repos **(M)**. Deploy consumes 1 of 100 Hobby deploys/day **(M)**. Zero Vercel functions, zero invocations, zero storage. |
| Freshness | Any cadence Actions supports (min 5 min; in practice `cron` on GitHub is also best-effort and often delayed 5–20 min during peak). Daily or 6-hourly is trivial. |
| Complexity | One workflow file + a Node script + `git commit`. No Vercel credentials needed — the existing `vercel[bot]` Git integration already deploys on push **(M)**. |
| Runtime budget | 6 h/job on GitHub-hosted runners vs **60 s** on this Vercel project **(I/M)**. A 5-year GraphQL crawl fits comfortably. |
| Secrets | `GITHUB_TOKEN` is auto-provided; for cross-account (`its-applekid`) data you need a PAT in repo secrets. |
| Downsides | Commits churn git history (mitigate: dedicated `data/` path + `[skip ci]`-style guard, or a `data` branch). Bundle is in the repo → repo grows. Deploy on every regeneration = full Next build each time. |
| Auditability | **Best of the three.** Every data change is a diff, reviewable, revertable, and the agent PR workflow can inspect it. |

### (b) Vercel Cron route writing to Vercel storage

| Axis | Assessment |
|---|---|
| Cost | $0 on Hobby within allowances, but consumes Function Invocations, Active CPU, Provisioned Memory, and Blob/Global-Config ops from the shared Hobby pool **(M)**. |
| Freshness | **Hard-capped at once per day, ±59 min jitter (M).** Strictly worse than (a). |
| Complexity | Highest: needs `CRON_SECRET`, a Blob or Global Config store, a read path in the app, cache invalidation, idempotency + locking (no retries, possible duplicates) **(M)**, and — because functions are currently *dead* — a working modern Next deploy first. |
| Runtime budget | **60 s max, 10 s default** on this pre-2025-04-23 project unless Fluid compute is enabled **(M/I)**. Likely insufficient. |
| Failure mode | Silent. No retry **(M)**, and Hobby keeps runtime logs for **1 hour** **(M)** — a nightly failure is unobservable by morning. |
| Storage fit | Global Config max store size is **1 MB** on all plans and only **100 writes/month** on Hobby **(M)** — a 250 KB bundle fits but 100 writes/mo ≈ 3/day is a hard ceiling. Blob has no such write ceiling but adds Edge Requests + Fast Origin Transfer per miss **(M)**. |

### (c) Build-time only generation

| Axis | Assessment |
|---|---|
| Cost | $0. Zero extra moving parts. |
| Freshness | Only as fresh as the last deploy. With no pushes for 5 years **(M)**, that means "never". |
| Complexity | Lowest — a `prebuild` script + `getStaticProps`. |
| Fatal flaw | Requires a `GITHUB_TOKEN` in Vercel build env, makes builds network-dependent and non-hermetic (a GitHub API blip = failed production deploy), and gives no refresh without a human. |

### Recommendation: **(a), with (c) as the degenerate fallback.**

Reasoning:
1. **The 60 s function ceiling on this specific project kills (b) (M/I).** It is the pre-2025-04-23
   legacy-limits case and the crawl is multi-minute.
2. **Hobby cron is once-per-day with ±59 min jitter (M)** — it is *not* fresher than a GitHub Actions
   schedule, it is strictly less fresh and less controllable.
3. **(b) needs a working Vercel function, and there isn't one today (M** — `FUNCTION_RUNTIME_DEPRECATED`**).**
   It cannot even be prototyped until the Next migration lands.
4. **No retries + 1-hour Hobby log retention (M)** make (b) operationally opaque. Actions gives
   permanent logs, retries, `workflow_dispatch` manual reruns, and failure notifications for free.
5. **Committing the bundle makes the data reviewable.** With two actors (`its-everdred`,
   `its-applekid`) and an agent-authored-PR workflow, a diffable data artifact is a feature.
6. **The backwards-in-time playback wants a split bundle anyway (I):** commit
   `public/data/recent.json` (last ~90 days, small, first-byte) plus
   `public/data/history-YYYY.json` shards fetched lazily as the visitor scrolls back. Static files on
   the CDN with `max-age=31536000, immutable` on the shards and a short TTL on `recent.json`. Zero
   functions, zero storage product, zero invocations — the entire data layer costs nothing and cannot
   exhaust a Hobby allowance.
7. **Cadence:** daily at a fixed UTC hour is plenty given live is out of scope. That is 1 deploy/day
   out of 100 **(M)**, and 30 commits/month of churn.

**Do not provision any Vercel storage product for this. (I)**

---

## 6. Vercel storage primitives in 2026

Source: https://vercel.com/docs/storage (`2026-06-17`) **(M)**.

| Product | Status | Hobby availability | Key limits | Needed here? |
|---|---|---|---|---|
| **Vercel Blob** | First-party | Yes | 100 stores on Hobby; 1,200 simple ops/min, 900 advanced ops/min; 512 MB cache limit per blob; 5 TB max file **(M)**. Free on Hobby within limits; **exceeding locks you out for 30 days (M)**. | **No** |
| **Global Config** (was Edge Config) | First-party | Yes | **1 MB max store size (all plans)**, **1 store total on Hobby**, 1 store per project on Hobby, 256-char keys, up to 10 s write propagation, 7-day backup retention on Hobby. Hobby included: 100,000 reads, **100 writes/month** **(M)**. | **No** |
| **Redis / KV** | **Marketplace only** (Upstash etc.) — no longer first-party **(M)** | via Marketplace | provider-dependent | **No** |
| **Postgres** | **Marketplace only** (Neon, Supabase) — no longer first-party **(M)** | via Marketplace | provider-dependent | **No** |
| **ISR durable cache** | Built into Next on Vercel | Yes | unlimited storage, 31-day unaccessed eviction **(M)** | Not needed if data is static files |

**Conclusion: none of them.** A precomputed 200–250 KB bundle committed to the repo and served from
`public/` is a plain CDN object — free, globally replicated, `immutable`-cacheable, and it consumes
none of the metered Hobby resources except Fast Data Transfer (100 GB/mo) and Edge Requests
(1M/mo) **(I)**.

If the bundle later grows past what's comfortable to commit (say >5 MB), **Blob** is the right
escape hatch, not Global Config (which caps at 1 MB and 100 writes/month on Hobby) **(M)**.

---

## 7. Next.js on Vercel — version, App Router, `vercel.json`, migration blockers

### Versions (M, `npm view next dist-tags`)

```
latest   16.2.12      beta    16.0.0-beta.0
canary   16.3.0-canary.104     preview 16.3.0-preview.10
next-15-3 15.3.9  next-14 14.2.35  next-13 13.5.11  next-11 11.1.4
```
`next@16.2.12` requires **Node >= 20.9.0** and peers `react@^18.2.0 || ^19.0.0` **(M)**.
`react@latest` = **19.2.8** **(M)**.

### App Router status

Fully GA and the documented default; Vercel's Next.js docs show `framework=nextjs-app` variants
first for every feature **(M)**. **Partial Prerendering is no longer experimental as of Next.js 16**
and is now the `cacheComponents` / `use cache` model **(M)**. Pages Router is still supported —
Vercel's docs still ship `pages/` examples for every feature **(M)** — and the cron-securing doc
explicitly notes "You can use App Router Route Handlers to secure your cron jobs, **even when using
the Pages Router**" **(M)**, i.e. mixed `app/` + `pages/` is supported.

**(I) Recommendation:** go to Next 16 + App Router. The site is 3 components and 1 page; there is no
migration cost worth preserving. Static-first (`generateStaticParams`/no dynamic APIs) keeps
everything on the CDN with zero functions.

### Node.js versions available on Vercel (M)

Only **24.x (default), 22.x, 20.x**. Node 20 is deprecated 2026-10-01 (changelog) **(M)**. Pin
`"engines": { "node": "24.x" }` in `package.json` — that overrides the project setting **(M)**.

### What `vercel.json` this project actually needs

**(I)** Almost nothing. Vercel auto-detects Next.js. A minimal, defensible file:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "headers": [
    {
      "source": "/data/history-:year.json",
      "headers": [{ "key": "cache-control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/data/recent.json",
      "headers": [{ "key": "cache-control", "value": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" }]
    }
  ]
}
```

- `installCommand` is the **explicit fix** for the dual-lockfile problem (§8). Note the docs' warning
  that an *override install command set in the dashboard* uses the oldest available version of that
  package manager **(M)** — prefer the `vercel.json` route plus deleting the losing lockfile.
- **Omit `crons`** unless strategy (b) is adopted.
- `redirects` for apex→www are **not** needed — Vercel already 308s at the domain layer **(M)**.
- Do **not** add `functions.maxDuration` unless you actually ship a function; on this legacy project
  it caps at 60 s anyway **(M)**.

### Does anything about the 2021 project block a jump to latest?

| Blocker | Severity | Evidence |
|---|---|---|
| **Next 10.1.3 + no `next.config.js` ⇒ webpack 4** (webpack 5 became default in Next 11; in 10.x it needed `future: { webpack5: true }`). Node 17+ ships OpenSSL 3, which removed MD4, which webpack 4 uses for module hashing → `error:0308010C:digital envelope routines::unsupported`. Vercel offers only Node 20/22/24. | **Blocking (I)** — the *current tree* almost certainly cannot be rebuilt on Vercel today. `ls next.config.js` → does not exist **(M)**; Node versions **(M)**. Mitigation if a stopgap build is ever needed: `NODE_OPTIONS=--openssl-legacy-provider`. |
| `@tailwindcss/jit@0.1.3` pinned; the package is a dead-end (npm latest `0.1.18`) — JIT was folded into Tailwind 2.1+ and Tailwind is now v4 with a different engine. `postcss.config.js` references `'@tailwindcss/jit'` **(M)**. | **Blocking for a Tailwind upgrade** — `postcss.config.js` and `tailwind.config.js` (`purge`, `variants`, `darkMode: false`) are all v2-era syntax **(M)**. |
| React 17 → 19 | Moderate; `react-typing-effect@2.0.5` last published 2022-06-26 **(M)** and will not have React 19 peers. Replace it. |
| eslint 7 + `eslint-plugin-react` flat-config era | Cosmetic. |
| Project name in `package.json` is literally `"with-tailwindcss"` (the Next example template) **(M)** | Cosmetic but worth fixing. |
| `"next": "latest"` in `package.json` **(M)** | **Actively dangerous** — combined with `yarn install` (not `--frozen-lockfile`), a rebuild could silently resolve a different major. Pin it. |
| Vercel project's stored Node.js Version setting | **Unknown — dashboard-only.** If it's pinned to 14.x/16.x, a redeploy errors immediately. Open question. |
| Functions already broken (`FUNCTION_RUNTIME_DEPRECATED`) **(M)** | Not a blocker to migrating — it *is* the reason to migrate. |

**(I) Practical consequence: the next `git push` to `main` will trigger a production deploy that
likely FAILS.** Vercel keeps serving the last good deployment on failure, so the site won't go down —
but the first modernization PR must land Next 16 + Node 24 + a fixed lockfile *atomically*, or the
first push should go to a branch and be validated on a preview URL.

---

## 8. Both `yarn.lock` and `package-lock.json` are committed

### What Vercel actually does — measured from source, not docs

`https://raw.githubusercontent.com/vercel/vercel/main/packages/build-utils/src/fs/run-user-scripts.ts`,
line 551 **(M)**:

```ts
// Priority order is bun with yarn lock > yarn > pnpm > npm > bun > vlt (lowest priority)
if (bunLock && yarnLock)      { cliType = 'bun';  ... }
else if (yarnLock)            { cliType = 'yarn'; ... }   // <-- us
else if (pnpmLockYaml)        { cliType = 'pnpm'; ... }
else if (packageLockJson)     { cliType = 'npm';  ... }
```

**`yarn.lock` wins. `package-lock.json` is ignored entirely (M).** Vercel runs `yarn install` with
Yarn 1 (`Yarn | yarn.lock present | yarn install | Yarn 1`,
https://vercel.com/docs/package-managers) **(M)**. The public docs table does *not* state the
precedence — only the source does. Worth recording.

### Why this matters here — the npm lockfile is stale and would break the build

`package-lock.json` `packages[""]` lists only `next`, `react`, `react-dom` as dependencies **(M)** —
it is **missing `@heroicons/react`, `react-typing-effect`, and `sass`**, all of which are in
`package.json` **(M)**. Git history confirms the drift: `package-lock.json` was last touched
`a995fea 2021-04-03`, `yarn.lock` `69978b2 2021-05-30` **(M)**.

**(I)** If anyone deletes `yarn.lock`, or a future `vercel.json` sets `"installCommand": "npm ci"`
against the *current* lockfile, the build fails at `import ReactTypingEffect from 'react-typing-effect'`.
The site works today only because yarn silently wins.

### The fix (pick one, do it in the modernization PR)

1. **Standardize on npm** (matches local `npm 11.16.0` and the `.gitignore`'s npm-flavoured
   entries): `git rm yarn.lock`, regenerate `package-lock.json` from a corrected `package.json`
   (lockfileVersion 3), add `"packageManager": "npm@11.x"` to `package.json`, and set
   `"installCommand": "npm ci"` in `vercel.json`. `npm ci` fails loudly on lockfile/manifest drift —
   which is exactly the guarantee we want given how this repo rotted.
2. Or standardize on pnpm (`pnpm 11.18.0` is installed locally **(M)**) — `pnpm-lock.yaml` beats
   `package-lock.json` but **loses to `yarn.lock`**, so `yarn.lock` must be deleted either way **(M)**.

Either way: **delete `yarn.lock`** and pin `next` to an exact version instead of `"latest"`.
Note: Corepack / `packageManager` in `package.json` takes precedence over lockfile detection **(M)**.

---

## 9. Preview deployments — already working, already the review surface

Source: https://vercel.com/docs/deployments/environments (`2026-05-28`) **(M)** + measured history.

> "By default, Vercel creates a preview deployment when you: Push a commit to a branch that is **not**
> your production branch (commonly `main`); Create a pull request (PR) on GitHub, GitLab, or
> Bitbucket; Deploy using the CLI without the `--prod` flag" **(M)**

**Measured proof it already worked on this exact repo (M):**
```
$ gh api repos/its-everdred/kevinweaver-dev/deployments
372387557  2021-05-31T15:56:54Z  Preview  7cbdb61  vercel[bot]
  → success  environment_url: https://kevinweaver-dev-kaypkx1x3-kevinweaver.vercel.app
372436980  2021-05-31T18:13:24Z  Production cefcffb vercel[bot]
  → success  environment_url: https://kevinweaver-dev-7cfb5y7ym-kevinweaver.vercel.app
```
7 Preview + 7 Production GitHub Deployments, all authored by `vercel[bot]`. Branches `home-mvp`,
`tailwindcss`, `timeline` still exist on the remote **(M)**. There are **zero PRs, open or closed**,
in the repo's history **(M)** — the 2021 workflow was branch-push, not PR.

**Answers:**
- **Automatic?** Yes, for same-repo branches and PRs, with no configuration. Already proven on this
  project **(M)**.
- **Two URL flavours (M):** a *branch* URL (always latest on that branch) and a *commit* URL
  (immutable). Use the commit URL when linking a review.
- **Hobby?** Yes — preview deployments are not a paid feature. What Hobby lacks is **Custom
  Environments** (Pro/Enterprise only, 1/project on Pro) **(M)** and **Password Protection** on
  previews (Pro add-on); Hobby previews can only be protected by **Vercel Authentication** (team
  members only) **(M)**.
- **Concurrency caveat (M):** Hobby is **1 concurrent build**. Several agent PRs landing at once
  queue serially. With a ~1-minute Next build that's fine; if it becomes annoying, `ignoreCommand`
  can skip builds for docs-only changes **(M)**, or Prioritize Production Builds can be enabled.
- **Rate ceiling (M):** 100 deployments/day and 100 builds/hour on Hobby. A daily data commit + agent
  PRs will not approach this.
- **Forks:** a PR from a fork does not get a preview by default (Vercel requires explicit
  authorization for fork deployments). Not relevant — `its-everdred` and `its-applekid` should push
  branches to the same repo, not forks. **(I)**
- **PR comments:** the Vercel GitHub App posts deployment links on PRs. Not directly verifiable here
  (zero PRs exist) **(M)** — but the app is installed and creating GitHub Deployment statuses with
  `environment_url` **(M)**, which GitHub surfaces in the PR timeline regardless.

**Verdict: yes, preview deployments are the right review surface for agent-authored PRs, and they
require zero setup.** The one prerequisite is §7 — the build has to succeed again first.

---

## 10. Open questions (need the user's dashboard or a `vercel link`)

1. **What Node.js version is pinned in the `kevinweaver-dev` project settings?** If 14.x/16.x, the
   first redeploy errors before running anything. Dashboard → Settings → Build and Deployment.
   Mitigation that needs no dashboard: set `"engines": { "node": "24.x" }` in `package.json`, which
   **overrides** the project setting **(M)**.
2. **Is the Vercel account Hobby or Pro, and is it a personal account or a "Hobby team"?** All of §3
   assumes Hobby. `kevinweaver` is a scope slug; note Vercel "does not support connecting a project
   on your Hobby team to Git repositories owned by Git **organizations**" **(M)** — `its-everdred` is
   a personal account, so this is fine either way.
3. **Are Production Deployment Protection / auto-promotion at defaults?** If auto-promotion was
   disabled, a merged PR won't go live.
4. **Is ISR genuinely unmetered on Hobby?** It has a Pro price ($0.0004/1K reads, $0.004/1K writes)
   but no line in the Hobby included-usage table **(M)**. Only matters if we adopt ISR — the
   static-file plan avoids it entirely.
5. **Blob's included Hobby allowances.** The docs' pricing example implies 5 GB storage / 100K simple
   ops / 10K advanced ops / 100 GB transfer included, but does not label which plan **(M)**.
   Unresolved; moot under the recommended plan.
6. **Does the 2021 project have a `.vercel` "Root Directory" or build-command override set?** Not
   visible without credentials.

---

## 11. Ticket-relevant summary

| # | Work | Why |
|---|---|---|
| 1 | Single-lockfile + pinned deps | `yarn.lock` beats `package-lock.json` **(M)**; npm lockfile is stale/broken **(M)**; `"next": "latest"` is a time bomb **(M)** |
| 2 | Next 10.1.3 → 16.x, React 17 → 19, Node 24, App Router | Only Node 20/22/24 exist on Vercel **(M)**; webpack-4 MD4 vs OpenSSL 3 blocks a rebuild **(I)**; functions already dead **(M)** |
| 3 | Minimal `vercel.json` (`framework`, `installCommand`, `headers` for `/data/*`) | Locks package manager; gives the data bundle correct CDN caching **(I)** |
| 4 | GitHub Actions daily bundle regeneration + commit | Free on public repos **(M)**; beats Hobby cron on freshness, runtime, retries, and observability **(M)** |
| 5 | Split bundle: `recent.json` + `history-YYYY.json` shards | Backwards playback needs recent-first bytes; keeps everything a static CDN object, zero metered resources **(I)** |
| 6 | Verify first deploy on a **preview** branch before touching `main` | Preview deploys already work on this repo **(M)**; protects the live site from a failed migration |

**Explicitly NOT needed:** Vercel Blob, Global Config, Marketplace Postgres/Redis, Vercel Cron,
Edge Middleware, ISR, Fluid compute, a Pro upgrade, `next/image`, or any change to DNS/domains.

---

# Verification corrections

Adversarial verification pass, 2026-07-31. Every item below was independently re-run. Verdicts:
4 of the 5 load-bearing claims stand; 1 stands in its conclusion but its stated **mechanism and
mitigation are refuted**. Five items marked **(M)** in the doc above were actually inferences or
were measured wrong.

## C1. §0/§7 — build failure: conclusion CONFIRMED, mechanism REFUTED

**The claim as written:** "Next 10.1.3 + no `next.config.js` ⇒ webpack 4 … Node 17+ ships OpenSSL 3,
which removed MD4, which webpack 4 uses for module hashing → `error:0308010C:digital envelope
routines::unsupported` … Mitigation if a stopgap build is ever needed:
`NODE_OPTIONS=--openssl-legacy-provider`."

**What was actually measured.** The exact `main` HEAD tree was extracted with `git archive HEAD`
into `/tmp/kwbuild`, installed with `yarn install --frozen-lockfile` (the committed `yarn.lock`,
i.e. what Vercel would do — see §8), and `./node_modules/.bin/next build` was run under four Node
majors from official `nodejs.org` tarballs:

| Node | Result |
|---|---|
| **16.20.2** | **BUILD SUCCEEDS.** Emits `chunks/framework.e3de07.js`, `chunks/webpack.50bee0.js`, `chunks/f6078781a05fe1bcb0902d23dbbb2662c8d200b3.*` — matching the chunk hashes served on production today, independently re-confirming "no drift" |
| **20.19.5** | FAILS |
| **22.14.0** | FAILS |
| **24.18.0** (Vercel default) | FAILS |

All three failures are **identical and are not the MD4/OpenSSL error**:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/parser' is not defined by
"exports" in /tmp/kwbuild/node_modules/next/node_modules/postcss/package.json
    at 552 (…/next/dist/compiled/postcss-scss/scss-syntax.js:1:11590)
```

Root cause (measured): `next@10.1.3` pins `postcss@8.1.7`, whose `exports` map is
`{".":{…},"./":"./"}` — a **folder mapping (trailing `"/"`)**, Node's DEP0148, which modern Node no
longer honours. `next/dist/compiled/postcss-scss` does `require('postcss/lib/parser')`, which now
resolves to `ERR_PACKAGE_PATH_NOT_EXPORTED`. This happens **during config load, before webpack is
ever constructed**, so the MD4 code path is never reached.

Two consequences:

1. **`NODE_OPTIONS=--openssl-legacy-provider` does NOT fix this.** Measured — re-run with the flag
   set produces the byte-identical `ERR_PACKAGE_PATH_NOT_EXPORTED`. The doc's stated stopgap is
   inert. Remove it.
2. The webpack-4 sub-claim is *true but irrelevant*: `next/dist/next-server/server/config-shared.js`
   contains `future:{…,webpack5:Number(process.env.NEXT_PRIVATE_TEST_WEBPACK5_MODE)>0}` **(M)**, so
   10.1.3 is webpack 4 by default, and `next/dist/compiled/webpack/bundle4.js` does contain `md4`
   **(M)**. It is simply not the thing that kills the build.

**Net effect on the headline: it gets STRONGER, not weaker.** The claim was marked **(I)** ("almost
certainly"). It is now **(M)**: the current tree provably cannot build on *any* Node version Vercel
offers. The next push to `main` will fail its production build.

**One over-scope correction (I).** §11 ticket 2 and the §7 conclusion assert the fix must be
"Next 16 + React 19 + App Router" landing atomically. A cheaper bump was tested and also fails, but
for a *different* reason: `next@14.2.35` + `react@18.3.1` on Node 24 clears the postcss/exports
error entirely and dies later, in the PostCSS pipeline on `styles/globals.scss`, because
`@tailwindcss/jit@0.1.3` is incompatible with the bundled PostCSS **(M)**. So the *toolchain* must
move as a unit (Next **and** Tailwind/PostCSS config), which is the doc's real point — but
"Next **16**" and "App Router" specifically remain a preference, not a measured necessity. Say so.

## C2. §9 — "7 Preview + 7 Production" is WRONG (marked (M))

```
$ gh api repos/its-everdred/kevinweaver-dev/deployments --paginate -q '.[].environment' | sort | uniq -c
      5 Preview
      9 Production
```

14 total is right; the split is **5 Preview / 9 Production**, not 7/7. Everything else in §9 verified:
zero PRs (`gh pr list --state all` → empty), branches `home-mvp`/`main`/`tailwindcss`/`timeline`
exist, last Production deploy `372436980 2021-05-31T18:13:24Z cefcffb vercel[bot]` with
`environment_url: https://kevinweaver-dev-7cfb5y7ym-kevinweaver.vercel.app`.

Note also: the deployments API returns `performed_via_github_app: null`, so App id 8329 was **not**
measurable from that endpoint. It is nonetheless correct — `gh api apps/vercel` →
`{"id":8329,"slug":"vercel","name":"Vercel"}` **(M)**. Cite that instead.

## C3. §1 — the Next-version grep does not reproduce (marked (M))

The doc shows `grep -oE 'version:"[0-9]+\.[0-9]+\.[0-9]+[^"]*"'` on `main-11fbeffca3be6fa5540b.js`
returning `"10.1.3"`. Re-run: that pattern returns **nothing**. The actual bytes in the served chunk
are `window.__NEXT_DATA__=M;t.version="10.1.3";` — an `=`, not a `:`. The **conclusion (deployed
Next = 10.1.3) is correct and independently re-confirmed**, but the transcript as printed is not a
real command output. Fix the pattern to `grep -oa 't\.version="[^"]*"'`.

## C4. §8 — "Corepack / `packageManager` takes precedence over lockfile detection **(M)**" is REFUTED

This is the last line of §8 and it feeds the §8 fix ("add `"packageManager": "npm@11.x"`"). From the
same file the doc already cites, `packages/build-utils/src/fs/run-user-scripts.ts`:

```ts
export function usingCorepack(env, packageJsonPackageManager, turboSupportsCorepackHome) {
  if (env.ENABLE_EXPERIMENTAL_COREPACK !== '1' || packageJsonPackageManager === undefined)
    return false;                                   // ← corepack OFF by default
```

and `detectPackageManagerNameWithoutLockfile(packageJsonPackageManager, …)` is reached **only in the
final `else` branch — when no lockfile exists at all**. Worse, when corepack *is* opted into,
`validateCorepackPackageManager` throws:

```ts
if (cliType !== validatedCorepackPackageManager.packageName) {
  throw new Error(`Detected package manager "${cliType}" does not match intended corepack defined
    package manager "…". Change your lockfile or "package.json#packageManager" value to match.`);
}
```

So `"packageManager": "npm@11.x"` while `yarn.lock` is still committed is either a **no-op** (default)
or a **hard build failure** (`ENABLE_EXPERIMENTAL_COREPACK=1`). The lockfile precedence at lines
551–567 is the whole story and is confirmed verbatim. **Deleting `yarn.lock` is the only thing that
switches the package manager.** The rest of §8 verified exactly: `package-lock.json` is
`lockfileVersion 2` and its `packages[""]` lists only `next`/`react`/`react-dom` — no `sass`, no
`@heroicons/react`, no `react-typing-effect` — while `yarn.lock` has all three (lines 84, 2366, 2514)
and pins `next@latest → 10.1.3` (line 1809).

## C5. §3 — two smaller (M) overreaches

- **"Build minutes are not metered on Hobby (M)"** → should be **(I)**. No Vercel page states this.
  It is inferred from the absence of a build-minute line in the Hobby included-usage table plus
  `/docs/builds/managing-builds`: *"By default, we enable elastic builds for paid teams"* and
  *"When your team uses Elastic, Enhanced, or Turbo machines, usage contributes to your build usage
  charges."* The inference is sound; the label is not.
- **"Hobby gets the fixed 2-vCPU Standard machine (M)"** — half wrong. `/docs/plans/hobby` does say
  Hobby build vCPUs = 2 **(M)**, but `/docs/builds/managing-builds` defines the **Standard** machine
  as **4 vCPU / 8 GB / 32 GB** **(M)**. Whatever Hobby runs on, it is not the machine Vercel calls
  "Standard". Drop the label, keep the number.

## C6. §4/§5 — cron: all facts CONFIRMED, but one argument is overstated

Every cron fact in §4 re-verified verbatim against `/docs/cron-jobs`,
`/docs/cron-jobs/manage-cron-jobs` and `/docs/cron-jobs/usage-and-pricing`: Hobby = 100 jobs / once
per day / per-hour (±59 min); *"Vercel will not retry an invocation if a cron job fails"*;
*"Cron delivery can also occasionally invoke the same scheduled run more than once"*;
*"Cron jobs do not follow redirects"*; disabled jobs still count; Instant Rollback does not update
active crons; UTC only, no `MON`/`JAN`, no DOM+DOW; GET to the production deployment URL;
`vercel-cron/1.0`; `x-vercel-cron-schedule`; `CRON_SECRET` → `Authorization: Bearer`. The legacy
duration table (Hobby default 10s / **max 60s**, pre-2025-04-23 non-Fluid) is quoted correctly, and
`/docs/fluid-compute` confirms *"As of April 23, 2025, fluid compute is enabled by default for new
projects"* — so a 2021 project is indeed non-Fluid by default.

**But:** §5 calls the 60 s ceiling *"the single strongest technical argument against strategy (b)"*.
It is the **weakest**, because it is defeated by one line — `{"fluid": true}` in the very
`vercel.json` §7 already recommends — which raises Hobby to 300 s default/max. The arguments against
(b) that actually survive scrutiny are the ones that **cannot** be configured away: **once-per-day
hard cap**, **±59 min jitter**, **no retries**, **best-effort delivery with possible duplicates**,
and **1-hour Hobby runtime-log retention**. Rewrite the §5 ranking accordingly — the recommendation
of (a) GitHub Actions is unchanged and correct.

Also downgrade to **(I)**: *"Preview deployments do not run crons."* The docs say Vercel makes the
request to the **production** deployment URL; they never state the negative.

## C7. Claims re-verified and standing unchanged

- `x-vercel-error: FUNCTION_RUNTIME_DEPRECATED` on `GET /api/hello` — reproduced. `pages/api/hello.js`
  exists in the tree.
- `last-modified` = CDN cache-fill time: re-derived on a fresh request — `date` − `age` −
  `last-modified` = **1.0 s** (rounding). Confirmed.
- `kevinweaver-dev.vercel.app` → 200 with etag `W/"08a1ed9ab5faf8b9…"` identical to `www`;
  `kevinweaver-dev-its-everdred.vercel.app` and `kevinweaver.vercel.app` → `DEPLOYMENT_NOT_FOUND`;
  apex → 308 → www; `/404` prerendered with `x-matched-path: /404`. All reproduced.
- Repo is public, issues enabled, default branch `main`, `pushedAt 2021-05-31T18:13:20Z`,
  **zero GitHub Actions workflows** (`actions/workflows` → `total_count: 0`).
- Lockfile precedence source lines 551–567 — verbatim match.
- Hobby limits: 1 concurrent deployment (*"Builds beyond this run sequentially"*), 100 deploys/day,
  100 builds/hr, 45-min build cap, 1-hour runtime logs, 1000 env vars / 64 KB, 50 domains,
  2048 routes, 15,000 files, 1 GB build cache / 1 month, 100 GB Fast Data Transfer, 1M Edge Requests,
  1M invocations, 4 CPU-hrs, 360 GB-hrs, 5,000 image transformations, 50,000 Web Analytics events.
- Global Config: 1 MB max store size (all plans), 1 store total on Hobby, 1 per project, 256-char
  keys, ≤10 s propagation, 7-day Hobby backups, 100 included writes/month.
  **Caveat found:** `/docs/limits`' rate-limit table separately lists *"Global Config writes per
  month (Free): 250"*. Vercel publishes two different numbers (included-usage 100 vs rate-limit 250).
  Immaterial — both disqualify Global Config — but cite both if this is ever load-bearing.
- Blob: 100 stores on Hobby, 1,200 simple / 900 advanced ops/min, 512 MB cache limit, 5 TB max file,
  and verbatim *"you will not be able to access Vercel Blob if limits are exceeded … wait until 30
  days have passed"*. Storage page lists exactly **Blob** and **Global Config** as first-party;
  Postgres/KV/Redis are Marketplace only. Confirmed.
- Node on Vercel: **24.x (default), 22.x, 20.x** only; `engines.node` overrides the project setting.
  Confirmed.
- npm: `next@latest` = 16.2.12, `engines.node >= 20.9.0`, peers `react ^18.2.0 || ^19.0.0`;
  `react@latest` = 19.2.8; `vercel@latest` = 58.4.4; `react-typing-effect` last modified
  2022-06-26; `@tailwindcss/jit` latest 0.1.18. All confirmed.

**Verdict on the five load-bearing claims: 1 = conclusion confirmed / mechanism refuted;
2, 3, 4, 5 = confirmed, with the sub-claim corrections in C2, C4 and C6.**
