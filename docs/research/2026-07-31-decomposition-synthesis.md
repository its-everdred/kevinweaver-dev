# kevinweaver.dev — Feature Decomposition Synthesis

**Date:** 2026-07-31
**Inputs:** 8 adversarially-verified research tracks (design-spec, vercel, nextjs-upgrade, data-pipeline, viz-runtime, ci-testing, content-ia, aiur-readiness)
**Rule applied:** where a verifier refuted a claim, the correction wins. Where two tracks disagree, I re-measured.
**Marking:** (M) measured this session with the cited command. (M-prior) measured by a track and re-confirmed. (I) inference.

---

## 0. Executive summary

Six things changed my plan versus what any single track proposed:

1. **The `gh` token is not SAML-SSO-authorized for `ethereum-optimism`.** (M) This silently deflates every authenticated contribution number by ~3,299 across 2025–2026. It is the root cause of *four* separate cross-track disagreements (contribution totals, "Optimism has zero public work", the 1826-vs-2038 window, the repo list). It is a human gate.
2. **Anonymous `git clone` is unaffected by SAML.** (M) `ethereum-optimism/actions` clones anonymously in 1.0 s. So the pipeline splits cleanly into a **token-free clone half** (drives the animation) and a **PAT-required GraphQL half** (drives the grid). Different auth, different tickets.
3. **WCAG 1.4.11 is unsatisfiable by any 10-step ramp** (3^9 = 19,683:1 required, sRGB max 21:1) (M). Both ramps under debate score identically on that metric. The disagreement dissolves; the fix is a non-colour channel, which both tracks independently recommended.
4. **`package.json` must be frozen by the foundation ticket.** Otherwise ~7 later tickets all edit `package.json`/`package-lock.json` and the whole graph serializes on lockfile conflicts. Pre-installing the full measured dependency set is the single highest-leverage parallelism move available.
5. **The comp is 7 structurally independent regions.** One module per region mounted by a shared shell turns what the tracks proposed as 3 huge tickets into 5 small parallel ones with zero write-surface overlap.
6. **The fleet config caps complexity 1–3 at 4/8/12 turns and gives complexity 4–5 no elevated budget** (M, `.aiur/config`). Complexity ≥4 tickets are execution risks. I kept exactly three of them, all intrinsically indivisible.

Wave profile (machine-verified topological levels): **2 → 10 → 11 → 3 → 2 → 3 → 1** across 32 tickets. Critical path 7 nodes / 21 of 77 complexity points, i.e. **73% of the work runs off the critical path**.

---

## 1. Re-measured ground truth (this session)

| # | Fact | Evidence |
|---|---|---|
| GT-1 | `gh` token lacks SAML grant for `ethereum-optimism`. | (M) `gh api repos/ethereum-optimism/actions` → HTTP 403 `Resource protected by organization SAML enforcement` |
| GT-2 | That repo is **public** and clones **anonymously**. | (M) anon `curl https://api.github.com/repos/ethereum-optimism/actions` → `private:false, stars 31, forks 22, created 2025-07-18, pushed 2026-07-31`; `git ls-remote https://github.com/ethereum-optimism/actions.git HEAD` → `138658d1…` |
| GT-3 | Authenticated GraphQL under-reports contributions. | (M) auth calendar 2024=2454 / 2025=1443 / 2026=2791 vs anon profile tooltip-sum 2024=2459 / 2025=**2695** / 2026=**4838**. 2024 agrees within timezone noise; 2025–26 diverge by 1,252 and 2,047 — exactly when the Optimism role starts (May 2025). |
| GT-4 | Restricted counts (auth): 2022=86, 2023=1028, 2024=2360, 2025=998, 2026=488. | (M) `contributionsCollection.restrictedContributionsCount` per year |
| GT-5 | **9 of 10** DS stylesheets are on disk and committed. `tokens/fonts.css` and `_ds_bundle.js` are the only missing links. **Zero** font binaries anywhere. | (M) `git ls-files` → 9 files under `docs/design/_ds/…`; comp `<link>` census → 10 hrefs; `find -iname '*.woff*'` → empty |
| GT-6 | Blobless clone is fast. | (M) `aiur-team/aiur` clone 0.9 s / 4.5 MB / `git log --all --name-only` 0.07 s / 3,588 commits / 7,342 unique paths. `ethereum-optimism/actions` clone 1.0 s / 3.2 MB / 2,984 commits / 1,451 unique paths. |
| GT-7 | Repo counts, all definitions. | (M) its-everdred: REST `public_repos` **77**; owner-public **77**; owner-public-non-fork **50**; incl. member affiliations **85**; `repositoriesContributedTo` **22**. its-applekid: **8** public, created 2026-01-29. |
| GT-8 | `origin/main` is **2 commits behind** local. | (M) local `d637182`, origin `cefcffb`; unpushed: `edae519` (design system + research) and `d637182` (.aiur config) |
| GT-9 | **SSH is broken** and `origin` is an SSH remote. | (M) `git remote -v` → `git@github.com:…`; `ssh -T git@github.com` → `Permission denied (publickey)` |
| GT-10 | Token scopes are `admin:public_key, gist, read:org, repo` — **no `workflow`**. | (M) `gh auth status` |
| GT-11 | Repo governance is bare. | (M) `rulesets` → `[]`; `allow_auto_merge:false`; `delete_branch_on_merge:false`; `owner_type:User`, `plan:null`; workflow permissions `write` + `can_approve_pull_request_reviews:true`; 9 default labels only, zero `agent:*` |
| GT-12 | Comp uses **16** non-ASCII codepoints, **zero** PUA. | (M) `Counter(ch for ch in comp if ord(ch)>0x7f)` |
| GT-13 | Comp is 1,033 lines; class has ~35 methods; `drawGraph` 705–903, `drawRibbon` 571–636, `drawOverview` 537–570, `drawGame` 637–684. | (M) `grep -nE '^  [a-zA-Z_$]+\(.*\) *\{'` |
| GT-14 | Fleet config: `max_concurrent_agents: 8`, `agent.kind: codex`, `max_turns: 12`, `max_turns_by_complexity` defines **only 1/2/3** (4/8/12). | (M) `cat .aiur/config` |
| GT-15 | Adjacent-level WCAG contrast is ~identical for both candidate ramps. | (M) comp ramp 1.22–1.47; viz ramp 1.23–1.50. `3^9 = 19683` needed for a 10-step 3:1 chain; sRGB max 21. |
| GT-16 | Comp agent ramp clips out of sRGB at levels **7, 8, 9**. | (M) OKLCh→linear-sRGB reimplementation of `buildColors()` |
| GT-17 | The viz ramp hits gruvbox anchors exactly; the comp ramp hits none. | (M) `#98971a` (green-d) at L6 and `#b8bb26` (green) at L7 present in viz ramp, absent from comp ramp |

---

## 2. Contradiction register

### C-1 — Contribution totals: 10,001 vs 10,006 vs 13,360 vs 13,147
**Positions.** content-ia: 10,001 over 2,038 days. data-pipeline: 10,006 over 2,038 days, log2 bands `{0:859,1:375,…}`. content-ia's verifier: 13,360 / 828 zero / 274 at n=1, and 13,147 over the comp's own 1,826-day window. design-spec: the comp's own `BINDAYS` sums to 370.

**Resolution.** All the low numbers were measured through the SAML-blinded token (GT-1, GT-3). All the high numbers were measured against the public profile. **Neither is a "correct" total — they are two different data sources, and the tracks were unknowingly mixing them.** data-pipeline separately measured (M-prior) that anon and auth disagree on 52 of 366 days in 2024 and warned "pick one source and never fall back."

**Decision (D-06, D-07).** Single source = **GraphQL through an SSO-authorized PAT**. It is the only source that (a) sees SAML orgs, (b) yields `restrictedContributionsCount` for the private aggregate, and (c) has a stable schema — the anonymous HTML markup already changed under me this session (`data-count` attributes gone, replaced by `<tool-tip>`; my first parse returned 0 cells). **No contribution number is hardcoded in any copy string** (D-08); every figure in the boot log, tmux bar and man page reads from `generatedAt`-stamped payload fields. That retires the 1826-vs-2038 argument entirely.

### C-2 — "Optimism produces zero public GitHub artifacts"
**Positions.** content-ia (M): `issueCount 0` for `author:its-everdred org:ethereum-optimism`, 488 restricted in 2026 → "the first frame of backwards playback is a grey redacted blob." Its verifier: `ethereum-optimism/actions` is public, 31 stars, its-everdred is top contributor with 2,198 commits.

**Resolution.** **Verifier wins, and I reproduced the mechanism.** GT-1/GT-2: the repo is public and anonymously clonable; the authenticated search returned an *empty set rather than an error* because the token lacks the SAML grant. The original finding measured the token, not the world.

**Consequence.** Both mitigations content-ia proposed (synthesise a placeholder node, re-order playback) are **deleted from scope**. The opening frame is the strongest node on the site. Also: content-ia's `#arc` commit body "this branch is not merged / no public evidence" must not ship.

### C-3 — Is `docs/design/_ds/` empty?
**Positions.** design-spec and nextjs-upgrade both (M): "empty, 0 files, every UI ticket blocked on DesignSync." Both verifiers: 9 of 10 present.

**Resolution.** **Verifiers win** (GT-5). The blocked surface is only `tokens/fonts.css` + 12 `.woff2` binaries. Design/CSS work is **unblocked today**; only the font ticket touches DesignSync — and D-04 removes even that from the critical path.

### C-4 — Why does the current tree fail to build?
**Positions.** vercel (I): webpack-4 MD4 vs OpenSSL 3, fixable with `NODE_OPTIONS=--openssl-legacy-provider`. Its verifier (M): the real failure is `ERR_PACKAGE_PATH_NOT_EXPORTED` from `postcss@8.1.7`'s removed `"./":"./"` exports mapping, reached via `next/dist/compiled/postcss-scss`; the legacy-provider flag does not fix it; `next@14.2.35 + react@18.3.1` clears it and then fails later because `@tailwindcss/jit@0.1.3` is incompatible with the bundled PostCSS.

**Resolution.** **Verifier wins.** Delete the `--openssl-legacy-provider` mitigation from the plan. The operative conclusion is stronger than either stated: **Next AND Tailwind/PostCSS must move as one atomic change**, which is precisely why KW-01 cannot be split.

### C-5 — Next 16 + App Router: necessity or preference?
**Positions.** nextjs-upgrade: mandatory re-scaffold. vercel's verifier: "'Next 16' and 'App Router' specifically remain a preference, not a measured necessity."

**Resolution.** Verifier is right that it is a preference; I commit to it anyway (D-02) on grounds none of the tracks combined: content-ia proved the site has **zero indexable text** without a server-rendered fallback, and RSC delivers the man page + git log at zero client JS. Recorded as a decision, not a measurement.

### C-6 — Contribution ramp: comp's OKLCh sweep vs viz's gruvbox-anchored ramp
**Positions.** design-spec: keep the comp ramp (`#32302f…#ffe87c`), "the ramp and histogram are real data." viz-runtime: replace with a gruvbox-anchored ramp (`#3c3836…#faeb77`) hitting `--green-d` at L6 and `--green` at L7. design-spec also measured "NO adjacent level pair reaches 3:1" as a WCAG 1.4.11 failure of the ramp.

**Resolution.** I computed both (GT-15/16/17). The 1.4.11 "failure" is **not a property of either ramp** — it is arithmetically impossible for any 10-step ramp. Both score 1.22–1.50 adjacent. So that argument decides nothing. What does decide it: the viz ramp hits two real gruvbox tokens exactly, so a token change propagates; the comp ramp hits none and would silently drift from the design system. **viz ramp wins** (D-09). Level 0 becomes `#3c3836` (1.41:1 vs pane, marginally better than `#32302f`'s 1.25:1) plus a 1px inner stroke.

The agent ramp contradiction **dissolves against ground truth**: contributions are *combined* in grid squares, so there is no second ramp in the grid at all. Both the sRGB clipping at levels 7–9 (GT-16) and design-spec's 1.07–1.18:1 human/agent invisibility are moot. The AG ramp survives only in the gource animation, on large-area actor tokens where a 1.07:1 cell-level ratio is not the operative metric.

### C-7 — Monotonic accumulation vs lifespan-interval visibility
**Positions.** viz-runtime: switch to lifespan-interval. Its own verifier marked the claim **[unproven]** and said "present §1.1 as the design decision it is, and stop using pack-instability as independent support."

**Resolution.** Honoured. D-10 commits to lifespan-interval **as a product decision**, not a measured necessity, with the mitigation the verifier hinted at: dead repos leave a **dimmed ghost outline**. That preserves the ground-truth property "the longer a visitor stays, the further back they see" while keeping the set honest. Pack-once layout is retained on its own merits (7.99 ms one-time, and it makes the choice reversible), *not* as evidence for lifespan semantics.

### C-8 — Clone cost: 342.6 s vs 40–45 s
**Positions.** data-pipeline (M): 144.3 MB / 342.6 s cold. Its verifier: 145 MB but **40–45 s**, an ~8× overstatement.

**Resolution.** **Verifier wins**, and GT-6 supports it — 0.9 s and 1.0 s for two mid-size repos. Consequences the verifier already drew and I adopt: no `xargs -P8` parallelism needed; the 16-repo pruning recommendation is dropped (it saves 145→124 MB, not →50 MB, and is not worth the complexity); and data-pipeline's third argument against Vercel Cron collapses.

### C-9 — Chunking numbers
**Positions.** data-pipeline: first byte 9,324 B brotli, worst dict slice 15,068 B gzip at chunk05, 8 KB split guard. Verifier: first byte is **9,598 B**; the 15,068 figure was transplanted from a CH=3,000 run; true max dict slice is **8,250 B**, which **fires the doc's own 8,192 B guard**.

**Resolution.** **Verifier wins.** Scheme D survives (12.9× better first byte than year-chunking even after a fair comparison). The split guard is raised to **12 KB gzip** and the CI first-byte budget stays **12 KB brotli** (D-07). Expect ~31 chunks.

### C-10 — Does GITHUB_TOKEN suffice for the pipeline?
**Positions.** data-pipeline (M): yes, no PAT needed. Its verifier: **[unproven]** — never tested with an installation token.

**Resolution.** **Refuted outright by GT-1/GT-3.** GITHUB_TOKEN is an installation token scoped to `kevinweaver-dev`; a third-party org's SAML grant cannot be attached to it. It will reproduce the 2,791-instead-of-4,838 deflation. The pipeline splits (D-06): clone half needs **no token**; GraphQL half needs an **SSO-authorized PAT** as a repo secret. This is human gate HG-3.

### C-11 — Does aiur enforce `depends_on` at runtime?
**Positions.** aiur-readiness (M): no, only the Executor's labelling choices. Verifier: **yes** — as GitHub-native issue dependencies written by `publish_build_order.py`, gated by `DispatchPolicy.todo_issue_blocked_by_non_terminal?`.

**Resolution.** **Verifier wins.** Two consequences: (a) issues **must** be created by `publish_build_order.py`, never `gh issue create`, or the graph is lost; (b) aiur-readiness's argument against auto-merge ("destroys depends_on ordering, which nothing else enforces") rests on a false premise. `serializes_with` remains genuinely un-enforced — so **D-05 designs the ticket set to have zero `serializes_with` pairs** and enables auto-merge for speed.

### C-12 — opencode bridge port
**Positions.** aiur-readiness: set `opencode.bridge_port: 4108` to avoid colliding with PID 1470581 on 4097. Verifier: actively harmful — leave **unset** so the `:default` source auto-selects; setting it converts a recoverable collision into a hard startup error.

**Resolution.** **Verifier wins.** Also noted: the on-disk `.aiur/config` (GT-14) has **no `opencode` section at all** and `agent.kind: codex`, so this is already correct in reality. Only `workspace.root` was a true MUST, and it is set (`~/code/kwdev-workspaces`).

### C-13 — Twitter handle
**Positions.** Authoritative resume: `@kevin_weaver`. GitHub profile `twitterUsername` field and the comp: `its_everdred`. content-ia assumed `its_everdred` because it is the measured, self-set value.

**Resolution.** Unresolvable without the user. The task brief marks the resume **authoritative**, so the default is `@kevin_weaver`; but the GitHub field is a live self-declaration that contradicts it. **Human gate HG-5.**

### C-14 — Lockfile precedence and `packageManager`
**Positions.** vercel (M): precedence `bun+yarn > yarn > pnpm > npm > bun > vlt`, so `yarn.lock` wins and the stale `package-lock.json` is ignored; add `packageManager` to fix it. ci-testing: Vercel "never states a precedence order." vercel's own verifier: `packageManager` is a **no-op or a hard build failure** — `usingCorepack()` returns false unless `ENABLE_EXPERIMENTAL_COREPACK=1`, and when opted in `validateCorepackPackageManager` *throws* on mismatch.

**Resolution.** vercel's source-read wins over ci-testing's docs-read (source beats docs). The verifier wins on `packageManager`. **Deleting `yarn.lock` is the only thing that switches the package manager** — and it must land in the same commit as a regenerated `package-lock.json`, because the committed one is stale (missing `sass`, `@heroicons/react`, `react-typing-effect`). Both facts fold into KW-01 as non-splittable.

### C-15 — ESLint version and `next lint`
**Positions.** nextjs-upgrade §8.2: `eslint: 10.8.0`. Its verifier: **9.39.5** — `eslint-config-next` peers `>=9.0.0`, and the ESLint 10 breakage is in transitive plugins. ci-testing also wrote "Flat ESLint 10" in a ticket title.

**Resolution.** **Verifier wins: pin `eslint@9.39.5`.** ci-testing's ticket title is corrected. Both tracks agree TypeScript pins to **5.9.3** (not `latest` = 7.0.2); nextjs-upgrade's verifier corrected the failure mode from "install fails" to "install succeeds with ERESOLVE warnings, then `npm run lint` hard-fails with *typescript-eslint does not support TS 7.0*" — so **`scripts/ci/assert-pins.mjs` must run before `eslint`**, per ci-testing's verifier.

Also adopted: Next 16 ships `next typegen`; run it **before** `tsc --noEmit` or typed-route checks fail.

### C-16 — Number of unguarded infinite animations in the DS
**Positions.** design-spec: five (`.rainbow`, `.hl`, `.uhl`, `.cursor`, `.glow`). Verifier: **six** — `layers/data.css` has `.metric.rainbowfill .meter .fill{…animation:rainbow-pan 16s linear infinite}` sitting immediately *above* the `prefers-reduced-motion:no-preference` block.

**Resolution.** Verifier wins. The recommended global stop covers all six either way; the count is corrected in KW-03's acceptance.

### C-17 — Scrollbar contrast fix
**Positions.** design-spec §9.7: `#504945` on `#1d2021` = 2.24:1, lift to `--bg3 #665c54` (3.35:1). Verifier: actual ratios are **1.86**, **2.52** and **3.37** — so the recommended `--bg3` fix **still fails** 3:1; only `--bg4 #7c6f64` clears it.

**Resolution.** Verifier wins; KW-03 uses `--bg4`.

### C-18 — "100% of the comp's resume copy is placeholder"
**Positions.** design-spec: 100%, and the git-log pane grows 5 → 9 rows. Verifier: not 100% (`2021–22 consensys · truffle` is correct, both GitHub contact tiles are correct); the pane grows 5 → **8**, not 9; and two unmarked inferences slipped in (`five months` → `six months`; appending `.com` to `notkevinweaver@gmail`, which the resume gives with no TLD).

**Resolution.** Verifier wins on all counts. The `.com` question is folded into human gate HG-5.

### C-19 — The comp's repo array
**Positions.** design-spec: "~40% wrong, invents 4 its-applekid repos, omits ~14 real ones." content-ia: "five repos do not exist." content-ia's verifier: **18 of 19 resolve**; only `truffle-box/templates` 404s; `agent-actions` and `vector-eth` both exist; `ConsenSys/truffle` and `trufflesuite/trufflesuite.com` 301-redirect to live `ConsenSys-archive/*`. The comp itself labels the block `/* mock data, shaped to the real distributions */`.

**Resolution.** **Verifier wins.** The fabrication is in the `vol`/`f`/`t` fields, not the repo IDs. Correct remedy: **regenerate volumes and date spans from the pipeline**, do not hand-curate a repo list. This also means the design track's open question "who owns the repo array?" is answered: the DATA track owns it, emitting the `{id, short, actor, vol, stars, from, to, private, ext[]}` shape design-spec asked for.

### C-20 — Repo count in the boot log
**Positions.** content-ia: "58 public repos." Verifier: not reproducible under any definition.

**Resolution.** GT-7 gives five defensible numbers (77 / 77 / 50 / 85 / 22). None is 58. Per D-08 the boot log reads the count from the payload with the definition stated in the payload schema (`ownerPublicNonFork`), so no literal ships.

### C-21 — Merge queue / branch protection
**Positions.** ci-testing: merge queue unavailable (User-owned repo, `plan:null`), so auto-merge only. aiur-readiness: auto-merge must **not** be enabled.

**Resolution.** ci-testing's constraint is measured and re-confirmed (GT-11). aiur-readiness's objection is void (C-11). **Auto-merge on**, `strict_required_status_checks_policy: false`, `required_approving_review_count: 0` for ordinary code, CODEOWNERS scoped to gate files only. Also per ci-testing's verifier: delete `merge_group:` triggers from all workflows — a merge queue cannot exist here.

### C-22 — Preview-based e2e as a PR gate
**Positions.** ci-testing (M): impossible because `repository_dispatch` only fires from the default branch. Verifier: conclusion right, justification wrong — must be re-grounded on (1) `vercel.deployment.ignored/.skipped/.error` emits no dispatch, so a required preview context waits forever with no workflow-side fix; (2) a PR editing `preview.yml` runs main's copy; (3) visual baselines must never come from a CDN-served preview.

**Resolution.** Verifier's three grounds adopted verbatim into KW-23/KW-31. Also corrected: the dispatch type list omits `vercel.deployment.ready`, and the citation path is `packages/repository-dispatch/src/types.ts`.

### C-23 — Screenshot container enforcement
**Positions.** ci-testing: pin `mcr.microsoft.com/playwright:v1.62.1-noble` and assert npm version == container tag; throw when `--update-snapshots` runs outside. Verifier: **both enforcement mechanisms are no-ops as written**; needs a three-way assert against a job-level `env` image tag, and `process.argv.some(a => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='))`, plus a CI step failing any PR diff touching `e2e/__screenshots__/**` outside the update workflow.

**Resolution.** Verifier wins; the corrected mechanisms are KW-31 acceptance criteria.

### C-24 — Determinism architecture defects
**Positions.** ci-testing: mulberry32 threaded through state. Verifier: three defects — carry RNG as a **32-bit integer field on SimState advanced functionally inside `step`** (a closure both violates purity and throws under `structuredClone`); add `{ checkGlobalObject: true }` to `no-restricted-globals`; widen the files glob.

**Resolution.** Verifier wins. viz-runtime independently proposed xorshift128; **mulberry32 wins** because ci-testing measured it uses only `Math.imul` and `>>>`, so it is bit-identical across V8 versions and architectures. Single RNG, single spelling, in KW-08.

### C-25 — `ctx.filter` and blit rules
**Positions.** viz-runtime: "never let `ctx.filter` near a path draw"; "no `save()/restore()/rotate()/globalAlpha` on the blit path (21× regression)." Verifier: the real rule is "**at most ONE draw call while `ctx.filter` is set**" — the stated rule forbids a legitimate implementation. And the blit rule is "**blit axis-aligned at integer coordinates**"; `save/restore/translate` are effectively free (0.005 ms), rotation and sub-pixel placement are not.

**Resolution.** Verifier wins; both rules restated in KW-22.

### C-26 — Grid as DOM vs canvas
**Positions.** viz-runtime: DOM needs 3,652 permanent nodes. Verifier: **1,827**, and DOM highlight-move (0.0205 ms) is indistinguishable from the canvas blit (0.0227 ms) — lead with the **O(1) arithmetic hit-test vs 1,826 event targets**, and with `shadowBlur` having no DOM/SVG equivalent.

**Resolution.** Verifier wins on both the count and the justification. Canvas still chosen. Note this partially conflicts with nextjs-upgrade's (I) "the grid should be a server-rendered inline SVG with zero client JS" — resolved in D-11: **canvas for the interactive ribbon/overview, plus a visually-hidden `<table>`** that serves as text alternative, `<noscript>` fallback and the SEO surface content-ia demanded. Both tracks get what they actually needed.

### C-27 — Sim scale
**Positions.** viz-runtime: 7,354 entities, peak live 869, resident state 172.4 KB. Verifier: real scale is **13,453 unique paths across 51 repos** (1.83× files, 2.55× repos); resident state **633 KB**; `Max repo circles 24` should be ~56.

**Resolution.** Verifier wins. GT-6 corroborates the order of magnitude (aiur alone has 7,342 unique paths). Consequence: the `<15 ms` boot-pack budget has **no measured headroom**, so KW-21 must measure per-repo unique-path counts and promote the **directory-level depth-2 rollup** from "may need" to the default, with individual files only on hover/zoom.

### C-28 — Font subsetting vs control glyphs
**Positions.** nextjs-upgrade: ship latin + latin-ext (4 of 12 woff2). Its verifier: ship **latin only**, or hand-author `@font-face` with unicode-ranges intact. design-spec's verifier: **11 glyphs / 33 occurrences fall outside every subset in `fonts.css`**. content-ia: coverage of `⏸ ▶ ⏮ ⏭ ✉ ☰ ⠿ ◉ ◆ ★` is **UNVERIFIED**.

**Resolution.** Two tracks converged on the same latent defect. GT-12 confirms the exact codepoint set. `U+23F8 ⏸`, `U+23EE ⏮`, `U+23ED ⏭`, `U+25B6 ▶` (Miscellaneous Technical media controls) and `U+283F ⠿` (Braille Patterns) are not plausible JetBrains Mono coverage. **D-04: replace every control glyph with an inline SVG icon.** This kills the subsetting rabbit hole, removes the last DesignSync dependency from the critical path, and is required for a11y anyway (buttons need accessible names, not glyph text). `· — • – → ◆ ●` stay as text.

### C-29 — Vercel Cron disqualification
**Positions.** data-pipeline: three reasons, including "342.6 s clone exceeds the 300 s ceiling." vercel: the 60 s ceiling is "the single strongest technical argument." Both verifiers: the duration argument is the **weakest** (defeated by `{"fluid": true}` in the very `vercel.json` already recommended), and the 342.6 s figure is an 8× overstatement.

**Resolution.** Verdict (GitHub Actions, not Vercel Cron) survives on the **non-configurable** grounds only: once-per-day hard cap, ±59 min jitter, no retries, best-effort delivery with possible duplicates, 1-hour Hobby log retention, and immutable read-only deployment FS. Duration arguments deleted.

### C-30 — Line-citation accuracy
**Position.** viz-runtime's verifier: six of ~sixteen line citations are off by 2–6 lines, and one misquotes the repo-easing coefficient (it is conditional on `this.snap`).

**Resolution.** I re-derived the authoritative line map myself (GT-13) and use it in the implementation pointers below. Tickets cite **method names first, line numbers second**.

---

## 3. Decision records

| ID | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| **D-01** | **One foundation ticket** (KW-01) lands toolchain + CI gate atomically. | C-4: Next and Tailwind/PostCSS must move as a unit or the build is red; C-14: deleting `yarn.lock` without regenerating `package-lock.json` is red. Any split leaves the repo red, violating the ticket boundary rule. The aiur Executor's mandatory "fresh CI green on the exact PR head" cannot be satisfied until a workflow exists, so CI cannot be deferred. | Three sequential foundation tickets (adds 2 waves of serialization before any parallel work). Splitting CI out (the gate would not exist for wave 2). |
| **D-02** | **Next 16.2.12 + React 19.2.8 + Tailwind 4.3.3 + TS 5.9.3 + ESLint 9.39.5 + App Router, no `output:'export'`.** | Toolchain must move as a unit anyway (C-4). App Router chosen for RSC zero-JS resume panes, answering content-ia's zero-indexable-text finding. Export rejected on `headers` for JSON cache-control and remote-avatar optimization — **not** on the apex→www redirect, which nextjs-upgrade's verifier showed export would not regress. | Incremental 10→11→…→16 hops; Pages Router; static export. |
| **D-03** | **`package.json` and `package-lock.json` are frozen after KW-01.** KW-01 pre-installs the entire measured dependency set and pre-declares every npm script. | ~7 downstream tickets would otherwise all edit both files, forcing `serializes_with` across the widest waves and collapsing parallelism. Highest-leverage single move in the plan. | Per-ticket dependency installs (lockfile conflict storm); a "dependencies" ticket per wave (serializes anyway). |
| **D-04** | **All control glyphs become inline SVG icons.** | C-28: two tracks independently found the media-control and Braille codepoints outside JetBrains Mono coverage. Also required for accessible names. Removes DesignSync from the critical path. | Subsetting 12 woff2 files; a Nerd Font patched build (licence + weight); accepting fallback-font rendering. |
| **D-05** | **Zero `serializes_with` pairs.** Every same-wave ticket owns a disjoint write surface; one module per region, one shell that mounts them. | C-11: `serializes_with` is the one edge type aiur does **not** enforce at runtime, so relying on it is unsafe *and* slow. Partitioning by file removes the need. | Sweep tickets (a11y pass, mobile pass) that touch every region file. |
| **D-06** | **Pipeline splits by auth surface.** Clone half: anonymous, no token. GraphQL half: SSO-authorized PAT. | GT-1/GT-2/GT-3: SAML blinds the API but not git. Two different secrets, two different failure modes, two different review boundaries. Also makes the human gate narrow — only the grid half blocks. | Single pipeline on GITHUB_TOKEN (measurably produces wrong numbers); scraping the anon HTML (markup changed under me this session). |
| **D-07** | **Scheme D encoding**: 1,500-event chunks, one global front-coded path dictionary sliced 1:1, newest-first numbering. Dict-slice split guard **12 KB gzip**; CI first-byte budget **12 KB brotli**. | data-pipeline measured 12.9× better first byte than year-chunking (76.2% of events are in 2026). Guard raised because the verifier measured a true max of 8,250 B, which fires the original 8,192 B guard. | Year chunks (103 KB first chunk); repo chunks (88 KB for aiur alone); self-contained per-chunk dictionaries (1.4–1.5× total inflation). |
| **D-08** | **No contribution figure is a literal anywhere in copy.** Every number reads from the payload; the payload carries `generatedAt`, `windowStart`, `windowEnd`, `dayCount`, `repoCountDefinition`. | Retires C-1 and C-20 permanently, and prevents the comp's three-inconsistent-windows bug from recurring. | Pinning 1,826 days; pinning 2,038 days (both wrong under SAML, and both go stale daily). |
| **D-09** | **Gruvbox-anchored 10-stop ramp** `#3c3836 #404a2b #4d5b21 #5e6a1f #70791d #83881b #98971a #b8bb26 #d9d34a #faeb77`, single ramp for the grid (combined actors), CIEDE2000 fixture in CI. | GT-17: hits `--green-d` and `--green` exactly, so token changes propagate. GT-15: the contrast argument is a wash. | The comp's synthetic sweep (hits no token, clips agent levels 7–9). |
| **D-10** | **Lifespan-interval visibility with dimmed ghost outlines for dead repos**, marked as a product decision. | Honours viz-runtime's verifier ([unproven]); ghosts preserve the ground-truth "longer stay = more history" property without the dishonesty of monotonic accumulation. | Monotonic accumulation (2021 shows repos that did not exist); lifespan with hard removal (reads as arbitrary vanishing). |
| **D-11** | **Canvas for the interactive grid + a visually-hidden `<table>`** as text alternative, `<noscript>` fallback and SEO surface. | Resolves C-26 and nextjs-upgrade's SVG proposal simultaneously; the table is also the only viable answer to WCAG 1.4.11 being unsatisfiable (GT-15) and to axe being blind to canvas. | Interactive DOM/SVG grid (1,827 event targets, no `shadowBlur`); canvas alone (zero indexable text, zero a11y). |
| **D-12** | **Auto-merge ON**, no merge queue, `required_approving_review_count: 0`, CODEOWNERS scoped to gate files only, `strict_required_status_checks_policy: false`. | C-21 + C-11. Merge queue is structurally unavailable (User-owned repo). Strict up-to-date checks make agents thrash on rebases with no queue to absorb it. | Human-gated merges (throughput cap); merge queue (does not exist). |
| **D-13** | **Issues are created only by `publish_build_order.py`.** | C-11: `depends_on` is enforced at runtime *only* as GitHub-native issue dependencies written by the publisher. `gh issue create` silently discards the graph. | Hand-created issues. |
| **D-14** | **Keep an honest `fresh · Nh ago` pill driven by `generatedAt`**; delete `emitLive()`'s random re-roll and its 2600 ms interval. | The live-transport scope cut removes the *transport*, not the *freshness signal*; `emitLive` is a local synthesiser (design-spec), and a synthesised "live" event is a lie the target audience will spot. | Removing the pill entirely (loses the dashboard affordance); keeping `emitLive` (fabricates data). |
| **D-15** | **Phone number <redacted-personal-phone> never enters the repo or build output.** Email decision deferred to HG-5. | content-ia's SIM-swap analysis, confirmed by its verifier. `kevinweaver.dev` already has five live Namecheap MX records, so an alias is a registrar-panel row, not a new service. | Obfuscation (does not survive OCR); publishing as-is. |
| **D-16** | **mulberry32**, carried as a 32-bit integer field on `SimState`, advanced functionally inside `step`. | C-24: only `Math.imul` and `>>>`, so bit-identical across V8 versions/architectures; the integer-field form fixes both the purity violation and the `structuredClone` throw. | xorshift128 (viz-runtime's proposal, no cross-engine guarantee stated); a closure-based RNG (throws under `structuredClone`). |
| **D-17** | **Scheduled regeneration on GitHub Actions**, never Vercel Cron. Workflow always commits (at minimum a `generatedAt` bump) and declares `workflow_dispatch`. | C-29's surviving grounds. Public repos auto-disable scheduled workflows after 60 days of no activity — and this repo has had **zero pushes since 2021-05-31**, i.e. it is already the failure case. | Vercel Cron; Vercel Blob/Global Config (1 MB cap, 100 writes/month on Hobby). |

---

## 4. Human gates

These genuinely block execution. Ordered by what they block.

| ID | Gate | Blocks | Why it cannot be worked around |
|---|---|---|---|
| **HG-1** | **Push `origin/main`.** Local is 2 commits ahead (GT-8) and **SSH is broken** (GT-9: `Permission denied (publickey)`, remote is `git@github.com:…`). Either add an SSH key or `git remote set-url origin https://github.com/its-everdred/kevinweaver-dev.git` and rely on the `gh` credential helper. | **Everything.** Agents clone `https://github.com/…` and check out `origin/main`; until this lands, `docs/design/`, `docs/research/` and `.aiur/` are invisible to every agent. | Cannot be done by an agent — the agent's own clone would not contain the work. |
| **HG-2** | **Grant `workflow` scope** to the credential agents push with (`gh auth refresh -s workflow`), *or* provision SSH keys for the fleet. Current scopes are `admin:public_key, gist, read:org, repo` (GT-10). | KW-01 (ships `.github/workflows/ci.yml`), KW-23, KW-28, KW-31. | GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**` without the scope. Failure is at push time, after the agent has done all the work. |
| **HG-3** | **Mint an SSO-authorized PAT** with `read:user`, authorize it for `ethereum-optimism` (and any other SAML org in scope), store as repo secret `CONTRIB_TOKEN`. | KW-10, KW-14, KW-28 — i.e. every grid/private-aggregate number on the site. | GT-1/GT-3: without it the site publishes numbers ~3,299 low across 2025–26. `GITHUB_TOKEN` cannot carry a third-party SAML grant (C-10). |
| **HG-4** | **Confirm the Vercel project's Node version, plan tier, and auto-promotion setting**, and whether a dashboard Root-Directory / build-command / install-command override exists. Requires dashboard or `npx vercel login && vercel link`. | KW-01's deploy verification; KW-32. | Dashboard-only. If Node is pinned to 14.x/16.x the first redeploy errors before running anything. A dashboard install-command override silently defeats `vercel.json`. `engines.node` in `package.json` is the one override reachable from the repo. |
| **HG-5** | **Content decisions, single sitting:** (a) Twitter `@kevin_weaver` vs `its_everdred` (C-13); (b) which email ships — `notkevinweaver@gmail` has no TLD and is not a valid `mailto:` (C-18); (c) job title — three conflicting variants exist; (d) does the `side` lane (aiur, gary, etherguild) appear at all; (e) name the podcast or cut `--podcast`; (f) availability string for the contact STATUS block. | KW-06, and transitively KW-16/17/19/27. | Every one is a claim about Kevin that no measurement can settle. (d) is itself a signal about what he wants public. |
| **HG-6** | **Merge wave-1 PRs by hand.** No CI exists until KW-01 merges, so the Executor's "fresh CI green" condition is unsatisfiable for KW-01 and KW-02. | KW-01, KW-02 only. | Bootstrapping paradox — the gate ships in the PR that needs the gate. |
| **HG-7** | **Decide the scanline treatment**: persisted user toggle, or drop `--scanline-opacity` from .35 to .20. | KW-03. | design-spec measured that the always-on scanline drags five borderline pairs across the AA line (fg4/bg1 4.171→3.905, gray/bg0 4.016→3.739, bg4/bg-h 3.369→3.146). Both fixes are legitimate; it is an aesthetic call with an accessibility consequence. |

**Non-gates** (recorded because tracks flagged them, but they do not block): DesignSync fetch — dissolved by D-04 and GT-5. Vercel CLI auth — only needed for dashboard-equivalent operations, not deploys. `its-applekid` write access — the config already documents it is not a collaborator and agents authenticate as the owner.

---

## 5. Ticket set

Complexity: 1 trivial, 2 small, 3 normal, **4 = split unless intrinsically indivisible**, 5 avoid.
Three tickets are complexity 4 and each carries a justification. Note GT-14: the fleet gives complexity 1/2/3 a budget of 4/8/12 turns and **no elevated budget for 4–5** — this is why the set skews to 1–3.

### Wave 1 — foundation (2 tickets)

**KW-01 — Foundation: toolchain re-scaffold + green CI gate** · complexity **4** · deps: none
*Outcome:* `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24, a blank-but-styled App Router page renders, and `.github/workflows/ci.yml` publishes a `ci-ok` status on every PR.
*Write surface:* `package.json`, `package-lock.json`, `yarn.lock` (delete), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc`, `.nvmrc`, `vercel.json`, `app/{layout.tsx,page.tsx,globals.css}`, `scripts/ci/assert-pins.mjs`, `.github/workflows/ci.yml`; deletes `pages/**`, `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `tailwind.config.js`, `.eslintrc.js`, `postcss.config.js`, `public/vercel.svg`.
*Why indivisible:* C-4 (Next + Tailwind/PostCSS must move together), C-14 (lockfile swap must be atomic with regeneration), and the Executor's CI-green precondition. Every subdivision leaves the repo red.
*Implementation pointers:*
- Exact pins, all (M-prior): `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` (**not** `latest` = 7.0.2), `eslint@9.39.5` (**not** 10.x — C-15), `eslint-config-next@16.2.12`, `tailwindcss@4.3.3`, `@tailwindcss/postcss`.
- **D-03 — pre-install the full downstream set now:** `vitest@4.1.10`, `@vitest/browser@4.1.10`, `@playwright/test@1.62.1`, `d3-hierarchy`, `zod`, `@octokit/graphql`, `size-limit@13.0.3`, `@size-limit/file`, `prettier`, `prettier-plugin-tailwindcss`. Pre-declare scripts: `dev build start lint format typecheck typegen test:unit test:e2e data:build size`.
- `postcss.config.mjs` is exactly `{plugins:{'@tailwindcss/postcss':{}}}`. Delete `autoprefixer` and `postcss-import` — Tailwind v4 has both built in. Delete `tailwind.config.js` entirely (v4 rejects `corePlugins`/`safelist`/`separator` in JS config).
- `engines.node: "24.x"` in `package.json` — the only Vercel Node override reachable from the repo (HG-4).
- `next typegen` **before** `tsc --noEmit` in CI (C-15).
- `assert-pins.mjs` runs **before** `eslint`, not alongside (C-15): a TS-7 install succeeds silently then hard-fails at lint.
- `ci.yml` shape from ci-testing §3.1/§3.2: a `changes` job + `if:`-skipped expensive jobs + one always-running `ci-ok` aggregator gated `if: always()` with a `grep` for failure/cancelled. **Never `paths-ignore` on a required workflow** — it deadlocks PRs at "Expected — Waiting for status". **No `merge_group:` trigger** (C-21).
- Actions pinned: `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/cache@v6.1.0`. Note `setup-node@v7` has `package-manager-cache` defaulting true.
- `vercel.json`: `framework: nextjs`, `installCommand: npm ci`, `headers` for `/data/*` cache-control. Do **not** add `packageManager` to `package.json` (C-14 — no-op or hard failure).
*Acceptance:*
- `yarn.lock` absent; exactly one lockfile; `next` pinned to an exact version, never `"latest"`.
- All five scripts green locally on Node 24 and in CI.
- `ci-ok` appears as a status on a test PR and is green when jobs are skipped.
- No `--openssl-legacy-provider` anywhere (C-4).
- `package.json` `name` is `kevinweaver-dev`, not `with-tailwindcss`.

**KW-02 — Repo governance: agent labels, CODEOWNERS, AGENTS.md, auto-merge** · complexity **1** · deps: none
*Outcome:* the full `agent:*` / `complexity:*` / `model:claude` label set exists, `main` is protected by a ruleset requiring `ci-ok`, auto-merge is on, the default `GITHUB_TOKEN` is read-only and cannot self-approve, and `AGENTS.md` states the contract.
*Write surface:* `.github/CODEOWNERS`, `AGENTS.md`, `.github/pull_request_template.md`, `.github/rulesets/main.json`; plus `gh api` calls (no other files). **Does not touch `.github/workflows/**`** — so it is not blocked by HG-2.
*Implementation pointers:*
- Label set (M-prior, `github/labels.ex:26-33`): `agent:{todo,in-progress,ci-wait,human-review,rework,merging,done,error,cancelled,canceled}` + markers `agent:{watch,paused,rate-limit-fallback}` + `model:claude` (required by the default `rate_limit_fallback`) + `complexity:1..5`.
- Flip `allow_auto_merge:true`, `delete_branch_on_merge:true`, squash-only; `actions/permissions/workflow` → `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false` (currently write + true — GT-11, a live hole).
- Ruleset: `required_approving_review_count: 0`, `require_code_owner_review: true`, `strict_required_status_checks_policy: false` (D-12). No merge queue — the repo is User-owned with `plan:null` (GT-11).
- CODEOWNERS scoped to gate files only: `.github/**`, `playwright.config.ts`, `vitest.config.mts`, `.size-limit.json`, `e2e/__screenshots__/**`. This makes it impossible for an agent to weaken a gate in the same PR that needs weakening, at zero cost on feature PRs.
- `bypass_actors` on a User-owned repo is unverified — if the POST is rejected, drop the key entirely.
- `AGENTS.md` must state: npm only (no yarn), no framework changes, `npm ci && npm run typecheck && npm run lint && npm run build` is the contract, branch is `aiur/<issue-number>[-slug]` read from `git branch --show-current` and never reconstructed.
*Acceptance:* `gh label list` shows the full set; `gh api …/rulesets` is non-empty; `gh api …/actions/permissions/workflow` returns `read`/`false`; a scratch PR can be marked auto-merge.

### Wave 2 — the wide wave (10 tickets, all deps: KW-01 only)

Every ticket below writes a **disjoint** surface. `package.json` is frozen (D-03); `app/globals.css` is owned solely by KW-03; `app/layout.tsx`/`app/page.tsx` solely by KW-05.

**KW-03 — Vendor the design system as web CSS + Tailwind v4 token bridge + global a11y layer** · complexity **3** · deps: KW-01
*Outcome:* `styles/ds/**` holds the 9 recovered DS files re-derived for the web; `app/globals.css` bridges every token into Tailwind via `@theme inline`; the global accessibility layer (focus ring, `.sr-only`, reduced-motion stop, overflow guard) exists. The comp renders identically at 1560 px.
*Write surface:* `styles/ds/**`, `styles/kw.css`, `app/globals.css`, `styles/ds/README.md`.
*Implementation pointers:*
- Source files are **already on disk** (GT-5, C-3): `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/{tokens/{colors,typography,spacing,effects}.css,layers/{base,type,pane,tmux,data}.css}`. `tokens/fonts.css` is absent and is **not needed** (D-04 + KW-04).
- The comp needs more than its 19 classes: also `base.css`'s `*{box-sizing}` reset and the `a{}`/`a:hover{}` element rules, and `effects.css` tokens `--scanline`, `--shadow-focus`, `--shadow-inset-track`.
- `@theme inline` is **mandatory**, not `@theme` (M-prior): plain `@theme` emits `.text-accent{color:var(--color-accent)}` frozen at `:root`; `inline` emits a live `var(--accent)` reference, which is what makes the DS's per-section `style={{'--accent':'var(--red)'}}` re-pointing work. Note: under `inline`, Tailwind 4.3.3 **still** emits `--color-accent: var(--accent)` into `@layer theme :root` — do not use its absence as a verification signal.
- Type scale: replace the comp's inline `font-size:13px` root (an absolute px that defeats browser font-size preference) with the clamp() ladder from design-spec §5.2, in rem, over a 360→1560 px band, landing within 0.5 px of the comp's hand-tuned desktop values. Add the new `--fs-prose` step (15→16.5 px). Re-derive the four steps the comp never overrode (`--fs-h1`, `--fs-h2`, `--fs-hero`, `--fs-stat` currently inherit slide values of 108/72/200/240 px).
- Contrast fixes, all measured against the correct surface `#1d2021` (`.pane` uses `--surface-pane` which aliases `--bg-h`, **not** `#282828`): six failures — bg4/bg-h 3.37, gray/bg-h 4.47, fg4/bg1 4.17, purple/bg1 4.23, fg3/bg2 4.05, and `.pane-bar{color:var(--text-faint)}` = fg4 on bg1 = 4.17 (the sixth, missed by design-spec's own audit). Scrollbar thumb must be `--bg4 #7c6f64` (3.37:1) — `--bg3` is only 2.52:1 and **still fails** (C-17).
- Global reduced-motion stop must cover **six** unguarded infinite animations (C-16): `.rainbow`, `.hl`, `.uhl`, `.cursor` (type.css), `.glow` (base.css), and `.metric.rainbowfill .meter .fill` (data.css).
- `:focus-visible` ring in `--fg0` — there is currently **not one focus state in the entire system** (zero `:focus`/`:focus-visible` rules across all five layer files and the comp).
- `body { overflow-x: clip }` — the tmux bar overflows below ~470–515 px and produces whole-page horizontal scrolling (WCAG 1.4.10 reflow failure at 320–414 px).
- Fold in the two `--pl-w` seam-patch rules the comp keeps outside the DS; `--tmux-h:40px` is dead (beaten by inline `height:24px`); `.dots i` is 14 px with a 9 px gap = 60 px of traffic lights in a 32 px bar (unfixed slide-scale leak).
- HG-7 decides scanline treatment.
*Acceptance:* all six contrast pairs ≥ 4.5:1 for text and ≥ 3:1 for non-text; a section-scoped `--accent` override provably recolours descendants; zero horizontal scroll at 320 px; `prefers-reduced-motion: reduce` halts all six animations; root font-size is relative.

**KW-04 — Self-host JetBrains Mono + SVG control icon set** · complexity **2** · deps: KW-01
*Outcome:* JetBrains Mono is self-hosted with zero external requests; every control glyph is an inline SVG icon component with an accessible name.
*Write surface:* `public/fonts/**`, `app/fonts.ts`, `components/icons/**`.
*Implementation pointers:*
- **D-04:** replace `U+23F8 ⏸`, `U+23EE ⏮`, `U+23ED ⏭`, `U+25B6 ▶`, `U+2709 ✉`, `U+2630 ☰`, `U+283F ⠿`, `U+25C9 ◉`, `U+2605 ★` with SVG. Keep `· — • – → ◆ ●` as text (GT-12 gives the full 16-codepoint census; zero PUA).
- Ship **latin only** — one roman entry + one italic entry (C-28). `next/font/local` `src` paths are *relative to the directory where the font loader is called*; `adjustFontFallback` for local fonts accepts only `'Arial' | 'Times New Roman' | false` and defaults to `'Arial'` — set it `false`, the whole design is monospace on a fixed grid so there is no metric mismatch to correct.
- Binaries: fetch from DesignSync project `583945d5-2203-4320-8a4e-b30afe61181d` under `assets/fonts/`, **or** substitute `@fontsource/jetbrains-mono@5.3.0` (OFL-1.1). Either is acceptable — this is why D-04 takes DesignSync off the critical path.
- Icons carry `aria-hidden="true"` and the *button* carries the accessible name; never put the name on the icon.
*Acceptance:* zero network requests to fonts.googleapis.com or fonts.gstatic.com in a production build; `document.fonts.ready` resolves with JetBrains Mono loaded; no control affordance depends on a codepoint outside Basic Latin + General Punctuation + Geometric Shapes.

**KW-05 — App shell + region slot contract + 7 region stubs** · complexity **3** · deps: KW-01
*Outcome:* `app/page.tsx` composes seven named region slots; each region is its own file with a typed props contract; every stub renders placeholder content and the page builds green. **This is the contract the whole of wave 3 depends on** (D-05).
*Write surface:* `app/layout.tsx`, `app/page.tsx`, `app/regions/_contract.ts`, `app/regions/{Header,Instrument,ManPage,CareerLog,Contact,TmuxBar,BootOverlay}.tsx` (stubs).
*Implementation pointers:*
- The comp is already seven structurally independent regions (GT-13 line map): `<header>`+`<nav>` 52–65; `<section class="kw-instr">` 68–117 (overview canvas 76, ribbon canvas 83, gource canvas 97, transport bar 106, log tail pane 118); man-page pane 128–145; `#arc` git-log pane 146–161; `#contact` pane 162–172; `.tmux` bar 173–184; boot overlay 185+.
- Also port the DS chrome primitives here so regions share them: `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx`. `Pane` gains `footer`/`as`/`labelledBy`/`bodyRef` per design-spec §3; the shipped `.d.ts` files in DesignSync document the original contracts (e.g. `components/chrome/Pane.d.ts` documents `title?/dots?/titleColor?/right?/focus?/bleed?` and "At most ONE focused pane per slide").
- `.pane-body{overflow:hidden}` is a hard DS rule — a scrollable pager needs an explicit `overflow:auto` override on that one pane.
- Do **not** import or edit `app/globals.css` (KW-03 owns it). Do **not** add dependencies (D-03).
- Heading outline is established here: `sr-only h1` + pane titles as `h2`/`h3`. The comp currently has **zero** headings.
*Acceptance:* `app/page.tsx` renders all seven stubs; `_contract.ts` exports a props type per region; a wave-3 agent can replace exactly one stub file without touching any other file; `next build` green.

**KW-06 — Content modules: resume, man page, career log, identity, boot** · complexity **2** · deps: KW-01
*Outcome:* every content string exists as typed data in `content/`, with zero placeholder copy and zero hardcoded contribution figures.
*Write surface:* `content/{resume.ts,manpage.ts,career-log.ts,identity.ts,boot.ts}`.
*Implementation pointers:*
- The authoritative resume is in the task brief. All six employers newest-first: Optimism (May 2025–present), Metropolis (Sep 2022–Apr 2025), ConsenSys (Sep 2021–Sep 2022), Stitch Fix (Dec 2017–Sep 2021), EMS Heroes (Mar 2014–Dec 2017), Omni Developers (Feb 2010–Mar 2014), plus Rowan (Sep 2008–May 2012).
- Git-log pane grows **5 → 8 rows**, not 9 (C-18).
- Deterministic short SHAs, `sha1(\`${org}:${startMonth}\`).slice(0,7)`: Optimism `ee787a7`, its-applekid `b85c3e3`, Metropolis `538d21c`, ConsenSys `3437755`, Stitch Fix `3cc4bc6`, EMS Heroes `79c6a5b`, Omni `4dc06be`, Rowan `9ee7ca6`. The comp's `0xc0de1` is **not valid hex** (`x` is not a hex digit) — the engineer audience will notice.
- **Delete the fictional employer era** `2023–24 ethereum foundation web properties`: measured reality is 1 commit + 1 PR to `ethereum/ethereum-org-website` (2023) and 1 PR to `ethereum-foundation-website` (2026). Those years are Metropolis.
- **Do not ship** content-ia's Optimism commit body "this branch is not merged / no public evidence" (C-2) — `ethereum-optimism/actions` is public with 2,984 commits (GT-6) and is the strongest node on the site.
- **D-08:** no contribution figure is a literal. `content/boot.ts` exports templates with `{contributions}`, `{days}`, `{repos}`, `{zeroDays}` placeholders filled from the payload. Correct the comp's three inconsistent windows (1,826-day hardcode at line 178, `Date.UTC(2021,7,1)` start at 273–274, 370-day boot figures at 428–431).
- ConsenSys copy should say "now archived" — all Truffle repos moved to `ConsenSys-archive/*` (truffle ★13,923). The 45 commits to `ConsenSys-archive/optimism-bridge-box` corroborate the resume's L2-bridging claim and arc cleanly into the Optimism role; scope that superlative to **2022 or "at ConsenSys"** only — `its-everdred/blocktracker-js` has 58 commits in 2021.
- Use the DS's unused `.commit .ref` class (`flex:0 0 auto; color:var(--text-faint)`) for git decorations like `(HEAD -> optimism, tag: role/optimism)`.
- **D-15:** the phone number must not appear in the repo or build output. HG-5 supplies email, Twitter handle, job title, side-lane, podcast, availability.
*Acceptance:* `grep -r '<redacted-personal-phone>' .` is empty including the build output; no contribution integer literal in `content/`; every employer from the authoritative resume present; all SHAs valid hex with no shared prefixes.

**KW-07 — Contribution ramp, log2 bands, and contrast fixtures** · complexity **1** · deps: KW-01
*Outcome:* the ramp ships as typed constants with a CI-checked verification fixture, so a future recolour that breaks distinguishability fails the build.
*Write surface:* `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts`, `test/viz/ramp-contrast.test.ts`.
*Implementation pointers:*
- **D-09 ramp:** `['#3c3836','#404a2b','#4d5b21','#5e6a1f','#70791d','#83881b','#98971a','#b8bb26','#d9d34a','#faeb77']`. L0 = `--bg1`, L6 = `--green-d` exactly, L7 = `--green` exactly (GT-17).
- Measured properties to assert: adjacent CIEDE2000 min 6.06 / max 16.61 / mean 8.27 (small-patch threshold ~3); non-adjacent min 12.55; WCAG vs pane `#1d2021` strictly monotone 1.41 → 13.44 (GT-15 reproduces the endpoints).
- Bands are **log2 doubling**, not quantile: `0, 1, 2–3, 4–7, 8–15, 16–31, 32–63, 64–127, 128–255, 256+`. Quantile binning provably fails — a large mass of days sit at exactly 1 contribution.
- **Do not** assert adjacent WCAG ≥ 3:1 — that is unsatisfiable (GT-15: `3^9 = 19,683` needed, sRGB max 21). Assert CIEDE2000 instead, and rely on D-11's hidden table for 1.4.11 conformance.
- Agent ramp `AG` is **animation-only** (C-6), not used in grid cells. It clips out of sRGB at levels 7–9 (GT-16) — clamp or cap at L6 with a pattern fill above.
*Acceptance:* test fails if any adjacent CIEDE2000 drops below 3; test fails if L6 ≠ `#98971a` or L7 ≠ `#b8bb26`; `level(n)` unit-tested at every band boundary.

**KW-08 — Viz contract: SimState types, lifespan cursors, seeded RNG** · complexity **3** · deps: KW-01
*Outcome:* the pure, DOM-free core of the visualization — types, the reverse-time cursor algorithm, and the RNG — lands as the **contract** both the reducer (KW-21) and the renderer (KW-22) build against in parallel.
*Write surface:* `lib/viz/sim/{types.ts,cursor.ts,rng.ts,state.ts}`, `test/viz/{cursor,rng}.test.ts`, `eslint.config.mjs` scoped override block.
*Implementation pointers:*
- **D-16 RNG:** mulberry32, carried as a **32-bit integer field on `SimState`**, advanced functionally inside `step` (C-24). Never a closure — it violates purity and throws under `structuredClone`. Only `Math.imul` and `>>>`, so bit-identical across V8 versions and architectures.
- **D-10 lifespan cursors:** visible iff `birth <= T <= death`. Reverse playback uses two monotone cursors — a static death-DESC array (chunk-local, streams for free) plus a max-heap on birth over the **live set only**. Measured 0.770 ms for a full 1,826-day reverse pass = 0.42 µs/day, exactly n adds and n removes, zero rescans.
- **Build no checkpoints and no bitsets.** A brute-force O(n) seek rescan of 7,354 entities is 9.7 µs; the 18 KB of checkpoint bitsets buys nothing.
- Dead repos get a `ghost` flag rather than removal (D-10).
- ESLint enforcement, scoped to `lib/viz/sim/**`: `no-restricted-properties` for `Math.random`, `Date.now`, `performance.now`; `no-restricted-globals` for `requestAnimationFrame`, `setTimeout`, **with `{ checkGlobalObject: true }`** (C-24) and a glob wide enough to actually match.
- The prototype has **6 `Math.random`, 5 `performance.now`, 4 `Date.now`/`new Date`** call sites inside sim/render code — including 2 in `emitLive` and 1 in `begin()` that the original attribution table missed. All are determinism blockers.
- Scale target from C-27: **13,453 unique paths across 51 repos**, not 7,354/20. Resident state ~633 KB of typed arrays. GT-6 corroborates (aiur alone: 7,342 unique paths).
*Acceptance:* `lib/viz/sim/**` imports cleanly in plain Node with no DOM; a Node-only smoke test runs 10,000 steps; `structuredClone(state)` round-trips; the same seed produces bit-identical output twice; the lint rules fire on a deliberate violation.

**KW-09 — Pipeline A: repo discovery + identity allowlist** · complexity **2** · deps: KW-01
*Outcome:* a pure Node module that resolves the in-scope repo set and classifies commit authorship, unit-tested against the 13-other-Kevins fixture.
*Write surface:* `scripts/pipeline/{discover.ts,identity.ts}`, `scripts/pipeline/__tests__/**`.
*Implementation pointers:*
- Scope is the union of the four `*ContributionsByRepository` connections across 6 years × 2 users — **not** `repositoriesContributedTo`, which returns only 22 (GT-7). data-pipeline measured 67 distinct public repos this way, spanning orgs the token cannot list.
- **Author email only.** Never committer (17.9% are rewritten to `GitHub <noreply@github.com>` by web-UI squash merges — 649 of 3,628 aiur commits, including 343 authored by its-applekid). Never display name (13 other Kevins and a second Weaver; `Kevin A <kevin@example.com>` alone has 427 commits — a `/kevin|weaver/i` matcher misattributes 500+).
- Allowlist: its-everdred `kevinw@oplabs.co, its.everdred@gmail.com, kevinweaver2@gmail.com, its-everdred@users.noreply.github.com`; its-applekid `its.applekid@gmail.com, its-applekid@users.noreply.github.com, applekid.mail@proton.me`. **Both** noreply forms must match — the bare `<login>@` and the `<id>+<login>@` (`1020682+its-everdred@`) forms both appear.
- The allowlist is a strict superset of GitHub's own attribution (zero false negatives): `api\local = 0` for both actors; `local\api = 91`, of which **89 are bare-noreply and 2 are `kevinw@oplabs.co`** (not "all bare-noreply" as originally stated).
- Repo count definitions differ wildly (GT-7). Emit `repoCountDefinition` in the payload (D-08); recommend `ownerPublicNonFork` = 50 + 8.
- **Do not prune zero-commit repos** (C-8): pruning takes 145 MB → ~124 MB, not → 50 MB, and cold clone is 40–45 s anyway.
*Acceptance:* `classify(email)` returns the right actor for all 7 allowlist emails and both noreply forms; returns `null` for `kevin@example.com` and all 13 other Kevins; discovery output is deterministic under `sort(nameWithOwner)`.

**KW-10 — Pipeline B: contribution calendar + private aggregate (SSO PAT)** · complexity **2** · deps: KW-01 · **HG-3**
*Outcome:* the 5-year per-actor day series and the monthly private aggregate, fetched through an SSO-authorized token, with a hard assertion that the token can actually see SAML orgs.
*Write surface:* `scripts/pipeline/{calendar.ts,private.ts}`.
*Implementation pointers:*
- **D-06 / C-10 — this is the half that needs the PAT.** GT-1/GT-3: a non-SSO token reports 2026 = 2,791 where the public profile reports 4,838, and 2025 = 1,443 vs 2,695. 2024 agrees within timezone noise, which is exactly why the defect went unnoticed for two tracks.
- **First action of every run must be a canary:** query a known SAML-org repo and hard-fail if it 403s or returns an empty set. GitHub returns *empty results rather than errors* for un-granted SAML orgs — silent wrong answers are the default failure mode.
- Use `contributionCalendar.totalContributions`, **not** the sum of the four category totals — they disagree by 4–9 per year per user (2024: 2,454 vs 2,446). The calendar is capped at 1 year per query: 6 windows × 2 users = 12 queries.
- Private aggregate: 67 monthly `restrictedContributionsCount` calls, ~36.6 s wall, 233 B raw / 160 B gzip. A 67-month sweep requesting `repository{nameWithOwner isPrivate}` on all four connections leaked **zero** private repo names even as repo owner with a repo-scoped PAT — GitHub structurally refuses. Measured restricted counts in GT-4.
- **Never mix sources.** The anonymous HTML fragment and authenticated GraphQL disagree on 52 of 366 days in 2024, and the anon markup is unstable — it changed under me this session (`data-count` gone, replaced by `<tool-tip>`).
- Co-authored-by trailer count is **937 commits / 25.8%** (not 1,116 / 30.8%); 307 of 3,628 aiur commits are authored by one actor and co-authored by the other, so GitHub credits both calendars. Emit both the naive sum and the deduplicated count; the site should display the number that matches both GitHub profiles.
*Acceptance:* the SAML canary fails the run when given a non-SSO token; 2025 and 2026 totals match the public profile within timezone noise (±10/yr); `restrictedContributionsCount > 0 && hasAnyRestrictedContributions` asserted; zero private repo names in the output.

**KW-11 — Vitest scaffolding: node / dom / browser projects** · complexity **2** · deps: KW-01
*Outcome:* three test environments run under one `vitest run`, with coverage thresholds, wired into `ci.yml`'s existing `unit` job slot.
*Write surface:* `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts`.
*Implementation pointers:*
- `@vitest/browser@4.1.10` with the Playwright provider runs the same test files in real Chromium, giving a genuine `CanvasRenderingContext2D`. Jest's alternatives are `jest-canvas-mock` (stubs most of the 2D API) or `node-canvas` (native build in CI, and a *different rasterizer* from Chromium's Skia, so its pixels prove nothing).
- Next 16 ships a first-party Vitest guide with an exact config.
- **Async Server Components are unsupported by Vitest** — Next's docs say so explicitly and recommend E2E. Therefore all build-time data-reading logic must live in pure functions, not in the component. This is a design constraint on KW-16/17, not just a test constraint.
- `test/canvas-recorder.ts`: a `ctx` recording Proxy that snapshots the draw-command sequence with numbers rounded to 3 dp. This catches ~90% of renderer regressions as readable one-line text diffs and keeps the PNG baseline count to roughly a dozen images — no Git LFS.
- Coverage gates: 95%+ on `lib/viz/sim`, 100% statements on `lib/bundle/codec`.
*Acceptance:* `npx vitest run` green across all three projects; the canvas project provably gets a real 2D context (assert a `getImageData` round-trip); coverage thresholds enforced and failing when breached.

**KW-12 — Bundle schema + codec contract (encode/decode)** · complexity **3** · deps: KW-01
*Outcome:* the wire format is specified once, with a byte-deterministic encoder and a decoder that share a module — so the pipeline writer (KW-14) and the client reader (KW-15) can be built **in parallel** against a reviewed contract.
*Write surface:* `lib/bundle/{schema.ts,codec.ts,frontcode.ts}`, `test/bundle/roundtrip.test.ts`.
*Implementation pointers:*
- **D-07 Scheme D:** 1,500-event chunks; **one global** path dictionary numbered in newest-first first-use order and sliced 1:1 with chunks. Self-contained per-chunk dictionaries inflate the total 1.4–1.5×.
- Front-coding the path dictionary: 705,385 B raw / 90,302 B gzip → 224,978 B raw / 70,252 B gzip for ~15 lines of decoder. The dictionary is **72.1%** of chunk00's brotli weight (not 54%); event columns cost only 1.44 B/event gzipped.
- Files: `manifest.json`, `repos.json`, `grid.json`, `events/ee-NN.json`, `paths/pd-NN.json`.
- Corrected first byte: `400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B` brotli (C-9). Budget 12 KB.
- **Split guard is 12 KB gzip**, not 8,192 B — the true max dict slice is 8,250 B and would fire the original guard on chunk 10 in today's real data (C-9). Expect ~31 chunks.
- Determinism: sort by `(authorDate DESC, repoName ASC, sha ASC, path ASC)`; repo ids from `sort(nameWithOwner)` not discovery order; `--no-renames` (rename detection is heuristic and non-reproducible); **author date, not committer date** (rebase and squash-merge rewrite committer date).
- Emit the shape the renderer needs (C-19): `{id, short, actor, vol, stars, from, to, private, ext[]}`.
- Payload carries `generatedAt`, `windowStart`, `windowEnd`, `dayCount`, `repoCountDefinition` (D-08).
- Note brotli's per-file window reset costs ~7 KB across 30 slices (77,354 br for 30 slices vs 70,354 br for one blob) — accepted, since first-byte latency dominates.
*Acceptance:* `decode(encode(x))` deep-equals `x` for a fixture corpus; encoding the same input twice is byte-identical; no dict slice exceeds 12 KB gzip; the schema is exported as types both KW-14 and KW-15 import.

### Wave 3 — the second wide wave (11 tickets)

**KW-13 — Pipeline C: blobless clone cache + author-filtered extractor** · complexity **3** · deps: KW-09, KW-12
*Outcome:* a cached blobless clone tree and a deterministic newest-first event list, produced with **no GitHub token at all**.
*Write surface:* `scripts/pipeline/{clone.ts,extract.ts}`.
*Implementation pointers:*
- **D-06 — this half needs no token, and SAML does not apply.** GT-2: `ethereum-optimism/actions` clones anonymously in 1.0 s despite the API 403. This is the half that drives the animation, and it sees the Optimism work in full.
- `git clone --filter=blob:none --bare`. Measured (GT-6): aiur 0.9 s / 4.5 MB / 3,588 commits / 7,342 unique paths; `ethereum-optimism/actions` 1.0 s / 3.2 MB / 2,984 commits / 1,451 unique paths. Whole corpus ~145 MB, **40–45 s cold** (C-8 — the 342.6 s figure is an 8× overstatement, so no `xargs -P8` complexity is warranted). Warm incremental fetch of all 66 is 28.0 s with 0 failures. `git log --all --name-only` across all repos is ~2.3 s.
- Extraction: `git log --all --no-merges --name-only --no-renames --pretty=...`, author-filtered via KW-09's `classify()`.
- **Transient failure handling is mandatory, not defensive:** `0xmetropolis/metro-sdk` failed live with `Connection timed out` while the API reported it public and reachable. On failure, keep the cached event list and mark `status: stale` — **never drop the repo**. Track `consecutiveFailures` with a 7-day drop rule.
- `actions/cache` gives 10 GB/repo with 7-day eviction; a week of dropped runs forces a ~45 s cold rebuild, which is acceptable.
- Open product question inherited: `--all` gives 3,593 commits for aiur vs 1,257 on HEAD. Default to `--all` (it is the honest file-touch record) and record the choice in the manifest.
*Acceptance:* running twice produces byte-identical event lists; a simulated network failure on one repo yields `status:stale` and preserves that repo's events; zero GitHub API calls in this module.

**KW-14 — Pipeline D: Scheme D encoder + validator + state file** · complexity **3** · deps: KW-12, KW-10
*Outcome:* the full bundle is written to `public/data/v1/`, validated against every invariant, and the run refuses to emit a suspect bundle.
*Write surface:* `scripts/pipeline/{encode.ts,validate.ts,state.ts}`, `data/.pipeline-state.json`.
*Implementation pointers:* uses KW-12's codec directly — do not reimplement. Validator asserts monotonicity, the round-trip assertion, per-repo `status`, and the 12 KB dict-slice guard (D-07). Exits non-zero rather than emitting. Never writes a bundle when KW-10's SAML canary failed.
*Acceptance:* exit code non-zero on any invariant breach; `public/data/v1/manifest.json` carries `generatedAt`/`windowStart`/`windowEnd`/`dayCount`/`repoCountDefinition`; two consecutive runs on unchanged input produce identical bytes except `generatedAt`.

**KW-15 — Client bundle loader: newest-first with one-chunk-ahead prefetch** · complexity **2** · deps: KW-12
*Outcome:* a typed client module that gets the newest data in the first byte and streams history backwards on demand.
*Write surface:* `lib/bundle/loader.ts`.
*Implementation pointers:*
- Boot fetch: manifest + repos + grid + chunk 0 + dict 0. Prefetch chunk k+1 when chunk k is 60% consumed. Decode the front-coded dictionary incrementally. Degrade gracefully when a chunk 404s.
- Runway arithmetic: the comp's `init()` seeds the log from day `N-40`, so first paint needs only the last ~40 days. One 365-day chunk buys 30 s at the default 12 days/sec and 11 s at the fastest (32 days/sec). Speeds array is `[4,8,12,20,32]`.
- Budget context: the 9,598 B brotli first byte is ~8% of the 115,334 B of compressed JS the **current** site already ships across 9 `_next` chunks.
- Expose a newest-first event iterator to the sim layer.
*Acceptance:* first-byte fetch set is exactly 5 files; a 404 on chunk N degrades to "history ends here" rather than throwing; prefetch fires at the 60% mark, asserted in a unit test.

**KW-16 — Region: man-page pane** · complexity **2** · deps: KW-05, KW-06, KW-03
*Outcome:* the full `man kevinweaver` page renders in a `less(1)`-style pager as a zero-client-JS server component, with an abridged variant below 1080 px.
*Write surface:* `app/regions/ManPage.tsx`.
*Implementation pointers:* sections NAME / SYNOPSIS / DESCRIPTION / OPTIONS / ENVIRONMENT / FILES / EXAMPLES / DIAGNOSTICS / SEE ALSO / AUTHOR / REPORTING BUGS / BUGS. Skills render as OPTIONS flags, education as FILES paths (tense-based fact allocation: this pane is *who he is*, the git log is *what he did* — that is what keeps them non-duplicating). Requires the explicit `overflow:auto` override on `.pane-body` (KW-03 ships the class; this ticket applies it). Own your own heading levels (`h2`/`h3` under KW-05's `sr-only h1`), focus states, and 320 px reflow — there is no a11y sweep ticket (D-05).
*Acceptance:* zero client JS in the RSC payload for this region; `j`/`k`/space scrolling works and is keyboard-reachable; no horizontal scroll at 320 px; abridged variant below 1080 px.

**KW-17 — Region: career git-log pane** · complexity **3** · deps: KW-05, KW-06, KW-03
*Outcome:* the career log renders with roles as branches, 8 collapsed rows expanding to commit bodies.
*Write surface:* `app/regions/CareerLog.tsx`, `components/ds/CommitLog.tsx`.
*Implementation pointers:* uses the DS's existing `.commit/.graph/.hash/.ref/.cyear/.cmsg` classes plus the never-used `.ref` slot. Roles model as branches merged into main at role **end**, with the current role as an open unmerged branch holding HEAD; Rowan (Sep 2008–May 2012) and Omni (founded Feb 2010) run as two live parallel lanes for two years — a genuinely good graph moment. Fix the `.rail-follows-.graph` alignment. `CommitLog` gains `stack`/`root`/hue-drives-hash. Never colour a row `--gray` (4.47:1 on the pane surface — a KW-03 contrast failure). Pre-web3 rows (Stitch Fix, EMS Heroes, Omni, Rowan) collapse behind `<details>` on mobile.
*Acceptance:* 8 rows; every hash valid hex; a root-commit row present; graph rails align to rows at every breakpoint; `<details>` collapse below 720 px; zero client JS.

**KW-18 — Region: header/nav + tmux status bar** · complexity **2** · deps: KW-05, KW-03, KW-04
*Outcome:* the sticky header and the tmux footer render from data, degrade correctly, and never cause horizontal scroll.
*Write surface:* `app/regions/{Header,TmuxBar}.tsx`, `components/ds/TmuxBar.tsx`.
*Implementation pointers:*
- `TmuxBar` gains a free-segment model with `hideBelow`. The bar overflows below ~470–515 px: 48 glyphs at 11 px JetBrains Mono ≈ 317 px plus ~150 px of segment padding, and `.tmux` has no `overflow` while every `.seg` is `white-space:nowrap`.
- Use the DS's unused `.wins/.win/.win.active/.host/.chev` classes to mirror section nav as tmux windows (`1:whoami 2:arc* 3:contact`). Powerline arrows are **CSS `clip-path`**, never Nerd Font PUA — the DS says so explicitly and GT-12 confirms zero PUA codepoints.
- The header's nav links set `border:none` inline, which deletes `base.css`'s `a{border-bottom}` — the only non-colour link affordance. Restore it; the active-section indicator must not be colour-only.
- The bar becomes a `<footer>` with `progressbar` roles.
- `--tmux-h:40px` is dead (beaten by inline `height:24px`) — resolve rather than carry.
*Acceptance:* no horizontal scroll at 320 px; segments shed via `hideBelow` rather than clipping; active nav item is distinguishable without colour; keyboard-reachable.

**KW-19 — Region: contact pane + privacy scrub** · complexity **1** · deps: KW-05, KW-06, KW-03
*Outcome:* the contact row ships with real links, real accessible text, and zero personal-data leakage.
*Write surface:* `app/regions/Contact.tsx`.
*Implementation pointers:* the comp's contact data is wrong twice — email `kevin@kevinweaver.dev` and `@its_everdred`, and both `href`s point at the dead anchor `#contact`. `rel="me"` on all links; accessible text, never `title=`; click-to-copy email with a `mailto:` fallback. Both **GitHub** tiles in the comp are already correct — do not churn them (C-18). D-15 and HG-5 govern email/handle. `kevinmweaver.com` TLS-times-out and HTTP-302s to a Yat handle — do not link it until HG-5 resolves.
*Acceptance:* zero phone number; every link resolves (no `#contact` dead anchors); accessible names present without `title=`; `rel="me"` on all five.

**KW-20 — Region: boot overlay** · complexity **2** · deps: KW-05, KW-06
*Outcome:* the cold-start log plays once per session, is fully skippable, and every number in it comes from the payload.
*Write surface:* `app/regions/BootOverlay.tsx`.
*Implementation pointers:* 16 lines at 100 ms cadence; skippable by click / Esc / any key; **fully bypassed** under `prefers-reduced-motion`. D-08: the comp's hardcoded `4,817 / 284 / 17` figures read from the payload instead. Session-scoped so a returning visitor is not re-gated.
*Acceptance:* no integer literal in the component; `prefers-reduced-motion: reduce` skips it entirely; Esc dismisses; it does not replay on client-side navigation within a session.

**KW-21 — Viz sim reducer + pack-once layout** · complexity **3** · deps: KW-08
*Outcome:* `step(state) -> state` is pure, fixed-timestep, and frame-rate independent; circle-pack layout runs exactly once at load.
*Write surface:* `lib/viz/sim/{step.ts,layout.ts}`, `test/viz/step.test.ts`.
*Implementation pointers:*
- **Every decay constant in the prototype is per-rendered-frame, so everything runs exactly 2× fast on a 120 Hz display:** `b.life -= 0.022`, `f.heat *= 0.955`, `this.flash -= 0.012`, `this.converge -= 0.02`, `r.alpha += (…)*0.045`, `r.px += (…)*0.045`, `a.x += (…)*0.09`, `r.hot += (…)*0.02`. Only `this.day -= sp * dt` is correctly dt-scaled. Convert all to half-life form under a fixed 120 Hz accumulator with a MAX_STEPS clamp. Note the repo-easing coefficient is **conditional on `this.snap`** — a detail one track misquoted.
- **Pack once** over the union of all files ever seen, never per set-change: `d3-hierarchy` `packSiblings`/`packEnclose`, 7.99 ms for 9,480 files, writing immutable `px/py/pr`. Visibility becomes an alpha/scale tween on a fixed position.
- **C-27 correction:** real scale is 13,453 unique paths across 51 repos, so the `<15 ms` boot budget has **no measured headroom**. Measure per-repo unique-path counts first; if the budget is missed, ship the **directory-level depth-2 rollup as the default zoom** with individual files on hover/zoom. Treat the rollup as a precondition, not a contingency.
- **Drop `d3-force` entirely.** Repos place on a deterministic ellipse by sorted index (`cos/sin`), already solved exactly in the prototype. Reject it on bundle size (9.25 KB) and untested cross-engine float reproducibility — **not** on determinism, since `d3-force@3.0.0` is deterministic by default via a seeded LCG (C-25 sibling correction).
- **Drop GSAP.** 28.3 KB gzip, larger than the entire rest of the viz runtime; the prototype already uses no tween library. It also ships **no LICENSE file** in its npm tarball — the `license` field is an English sentence, not an SPDX id, so SBOM tooling reports UNKNOWN, and the hosted text is mutable without a version bump. Fallback if a hand-rolled helper proves insufficient: `@tweenjs/tween.js@25.0.0`, MIT, 7.0 KB gzip, whose `TWEEN.update(time)` API is explicit time-driving — exactly right for a fixed-timestep sim.
*Acceptance:* identical output at 60 Hz and 120 Hz for the same tick count; `packSiblings` called exactly once, asserted by a spy; no `d3-force` or `gsap` in the dependency tree; sim remains DOM-free.

**KW-22 — Viz render modules: graph / ribbon / overview** · complexity **4** · deps: KW-08, KW-07
*Outcome:* three pure `render(state, ctx)` modules with measured per-frame budgets, correct geometry, and no filter/blit hazards.
*Write surface:* `lib/viz/render/{graph.ts,ribbon.ts,overview.ts,cluster.ts,budget.ts}`.
*Why complexity 4:* three canvases sharing one projection model, one colour pipeline and one budget instrument; splitting them creates three tickets that must agree on an unreviewed interface. Intrinsically indivisible at this boundary. Port target is `drawGraph` 705–903, `drawRibbon` 571–636, `drawOverview` 537–570 (GT-13).
*Implementation pointers:*
- **`ctx.filter` rule (C-25, corrected):** *at most **one** draw call while `ctx.filter` is set* — not "never near a path draw". Measured 5.44 ms **per draw call** at 1280×720 regardless of primitive size; 20 large arcs = 108.72 ms/frame. The private-repo cluster is built into a 300 px offscreen, blurred once (0.196 ms), and blitted (0.0202 ms) — a 280× improvement. Feature-detect `ctx.filter`; hatch-and-dashed-ring is the fallback.
- **Blit rule (C-25, corrected):** *blit axis-aligned at integer coordinates*. `save/restore/translate` are effectively free (0.005 ms); **rotation and sub-pixel placement** are what cost 21×. Do not ban `save/restore`.
- Grid is a **cached offscreen bitmap** rebuilt only on data change or resize; per-frame draw is `drawImage` + one column wash + one `strokeRect` = 0.0225 ms, ≥15× better than per-cell redraw. Bitmap is 3,393 × 91 px. A 5-year grid cannot fit any screen — 261 week-columns × 13 px = 3,393 px — so the two-tier overview-strip + detail-ribbon split is **arithmetically required**, not stylistic.
- **Ribbon anisotropic-gutter bug:** x advances by `cw` but y advances by `step = cell + 2.5`. At W=1198, H=140 that is a 9.4 px horizontal gutter against a 2.5 px vertical one — the grid reads as columns of dashes. Crossover is W ≥ 830 px so it only shows on desktop. Fix: both axes advance by `cell + gap`; grow the box to `clamp(120px, 20vh, 200px)`.
- **Gource projection:** the 40/34/40 px dead margins become `clamp(16px, 4%, 40px)` — at the 720 px breakpoint's forced 340 px height they consume 22% of the canvas. The forced heights pin `ry` to its 0.38 cap while `rx` stays 0.42, flattening the repo ring until labels collide; below 1080 px render a reduced repo set.
- DPR clamp `Math.min(2, devicePixelRatio)` — scaling is sub-quadratic because path setup is CPU geometry (3.952 / 4.920 / 7.036 / 10.596 ms at dpr 1/1.5/2/3); clamping saves 34% vs dpr 3.
- Unit costs for the budget instrument: small arc fill 1.21 µs, 40 px radial line 0.30 µs, ~640 px line 2.55 µs (cost tracks **length**, not count), `fillText` 11 px mono 1.57 µs, `shadowBlur` a 5.3× penalty. Full scene 3.952 ms at dpr 1 = 23.7% of a 16.7 ms budget. **All numbers are Chromium SwiftShader software raster** — treat as conservative, re-measure on GPU before hard caps.
- Canvas font sizes read from resolved CSS custom properties, never 9 px literals.
- Sprites ship as 27×31 ASCII grids + a gruvbox palette map (964 B vs 2,325 B for the PNG), rasterized to OffscreenCanvas at boot with `imageSmoothingEnabled=false`. `public/images/kevin.png` is a 27×31 bust stored at 10×; its 11-colour palette contains **no gruvbox token** and it is unusable at the r=11 px draw size. Its ASCII extraction is already proven.
- Benchmarking note: Chromium **defers** canvas commands — without a forced `ctx.getImageData(0,0,1,1)` flush every microbenchmark reports 0.0000 ms. An entire earlier benchmark round was invalid for this reason.
*Acceptance:* `ctx.filter` set for at most one draw call, enforced by a lint rule or the recording Proxy; all blits axis-aligned at integer coords; ribbon cells square with isotropic gutters at every width; frame budget instrumented and asserted; render modules are pure functions of `(state, ctx)`.

**KW-23 — Playwright scaffolding + containerized e2e workflow** · complexity **3** · deps: KW-01, KW-11 · **HG-2**
*Outcome:* a sharded `e2e` job runs inside a pinned container against a locally built Next server and exposes one `e2e-ok` context. No screenshots yet.
*Write surface:* `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css`, `.github/workflows/e2e.yml`.
*Implementation pointers:*
- `mcr.microsoft.com/playwright:v1.62.1-noble`, matching `@playwright/test@1.62.1` and `ubuntu-latest` (noble).
- **Three-way version assert** (C-23): hoist the image tag to a job-level `env`, and compare it against `npx playwright --version` **and** the package version. Asserting npm-version == container-tag alone is a no-op.
- `page.clock` is the rAF kill switch and needs no app-side hooks — it fakes Date, setTimeout, setInterval, requestAnimationFrame, requestIdleCallback and performance. Use `runFor(ticks)`, **never `fastForward`** (it fires each timer at most once, so it drops rAF frames).
- `toHaveScreenshot` defaults: threshold 0.2, animations `'disabled'`, caret `'hide'`, scale `'css'`. CSS animations are already frozen; the canvas rAF loop is **not** — hence the clock.
- **Preview e2e is never a PR gate** (C-22), on three grounds: `vercel.deployment.ignored/.skipped/.error` emits no dispatch so a required context waits forever with no workflow-side fix; a PR editing the workflow runs main's copy; and visual baselines must never come from a CDN-served preview. Keep preview smoke as a post-merge canary with `workflow_dispatch`.
- If Deployment Protection is on, Playwright needs `x-vercel-protection-bypass` **plus** `x-vercel-set-bypass-cookie: true` — the cookie variant is required for in-browser follow-up navigations, which Playwright does constantly.
- No `merge_group:` trigger (C-21).
*Acceptance:* the three-way version assert fails on a deliberately mismatched tag; `e2e-ok` posts on every PR; smoke specs pass against a locally built server; no dependency on any Vercel preview.

### Wave 4 — assembly (5 tickets)

**KW-24 — Viz driver: single rAF owner, test harness, reduced motion** · complexity **2** · deps: KW-21, KW-22
*Outcome:* exactly one file in the codebase calls `requestAnimationFrame`; a frame is fully described by `(payload, seed, tick)`.
*Write surface:* `lib/viz/driver.ts`, `lib/viz/testHarness.ts`.
*Implementation pointers:* `window.__viz` behind `?viz-test=1` exposing `pause/reset/renderFrame/seekTick/seekDate/inspect/setQuality`, each awaiting a `getImageData` rasterization flush so Playwright cannot race the command buffer. `inspect()` returns `{date, liveRepos, highlightCell, rngState, drawCalls}`. `seekTick` is O(n) = 9.7 µs, never a replay of t steps. **`matchMedia` must get a `change` listener** — the prototype reads it once in the constructor; and `tickClock()` only runs inside the rAF loop, so the tmux clock freezes at the literal `09:41` forever under reduced motion. `settleStatic()` must render `visible(e, today)` — the seed set — not the fully accumulated final state, which is wrong under lifespan semantics (D-10). Quality ladder is read only by `render/`, never `sim/`, so degradation cannot affect determinism.
*Acceptance:* grep finds `requestAnimationFrame` in exactly one file; two renders at the same tick are bit-identical; the reduced-motion path renders one static frame and the clock still ticks; harness absent from production builds.

**KW-25 — Region: instrument pane** · complexity **3** · deps: KW-05, KW-15, KW-24
*Outcome:* the three canvases mount with their own ResizeObserver + DPR sizing and repaint only when their own inputs change.
*Write surface:* `app/regions/Instrument.tsx`, `components/viz/{Overview,Ribbon,Gource}.tsx`.
*Implementation pointers:* each canvas self-sizes; measured desktop gource size at 1080p is 1194 × 602 (AR ≈ 1.98:1) from `1560−28−14−320−4` and `100vh−60−274−14−32−38`. Convert drag-to-scrub and hover to **Pointer Events** — the prototype is `onmousedown` + window `mousemove`/`mouseup` with no touch path, so the overview strip is inert on phones despite its `cursor:ew-resize`. `100vh` → `100dvh`. `this.rbGeom` must survive (hover depends on it). Canvases get `role`/`aria-label` plus the D-11 hidden table. Lazy-load the viz island so it is not requested before scroll-into-view.
*Acceptance:* no repaint when an unrelated region's state changes; touch drag works on the overview strip; DPR backing store asserted; no layout shift on resize; island not requested until in view.

**KW-26 — Transport bar, keyboard controls, and Bomberman deletion** · complexity **2** · deps: KW-24, KW-04, KW-05
*Outcome:* playback controls are real buttons with real keyboard handling, and the cut arcade game is gone.
*Write surface:* `app/regions/TransportBar.tsx`, plus deletions in `lib/viz/render/ribbon.ts`.
*Implementation pointers:*
- Delete `drawGame()` (637–684), its call site (633), `this.walkable` (642), `this.bot`, `this.userPlay`, and the whole `keydown` block (477–491) — ~65 lines. **`this.rbGeom` (577) must survive.** Also remove `clockRef`, `infoOpen`/`onInfoIn`/`onInfoOut`, and `.kw-hide-md` (defined in CSS, applied to zero elements).
- Space is currently `preventDefault`-ed **unconditionally on window** for the deleted game, which blocks activating the one real `<button>` and blocks page-down scrolling. After deletion, rebind Space to play/pause **scoped to the transport region**, never window.
- Six of seven controls (`onSeek`, `onJumpStart`, `onJumpBirth`, `onJumpLive`, `onSpeed`, `onSkipBoot`) are `<span onClick>` — not focusable, not keyboard-activatable, no role. Convert to `<button>`; the seek track becomes a restyled `input[type=range]` with `aria-valuetext`.
- Icons from KW-04 (D-04), never glyphs.
- **D-14:** keep an honest `fresh · Nh ago` pill driven by `generatedAt`; delete `emitLive()`'s 2600 ms interval and its two `Math.random` sites. Keep the breathing ring on today's cell.
*Acceptance:* every control is a focusable button or range input with an accessible name; Space activates play/pause and does not block page scroll outside the region; `grep -ri bomberman\|drawGame\|walkable` is empty; the pill never claims data it does not have.

**KW-27 — SEO, metadata, OG image, /resume.txt, noscript fallback** · complexity **2** · deps: KW-05, KW-06, KW-16, KW-17
*Outcome:* the site presents correctly when shared and has real indexable text.
*Write surface:* `app/layout.tsx` metadata export, `app/opengraph-image.tsx`, `app/resume.txt/route.ts`, `app/kevinweaver.1/route.ts`, `public/og.png`.
*Implementation pointers:* the live site currently serves `<title>Hi.</title>` with `next-head-count 4`, no description, no OG/Twitter tags, no canonical, no favicon link, no `lang`. Measured copy: title 47 chars, meta description 150 chars (inside Google's ~155–160 truncation). `@vercel/og` runs satori on the Edge with **no canvas**, so the OG ribbon must be flat SVG/JSX rects and JetBrains Mono must be supplied as an `ArrayBuffer`; **a static `public/og.png` fallback is mandatory** because a 500ing card renders as no card, silently, on every platform. `/resume.txt` and `/kevinweaver.1` generate from the same `content/` modules the panes use — `curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` should render. The `<noscript>` block carries the man page and git log (D-11).
*Acceptance:* OG card renders in a validator; the static fallback is served when the dynamic route errors; `/resume.txt` matches the rendered panes; `lang` attribute present; `curl` of the page contains the full resume text.

**KW-28 — GitHub Actions daily data workflow** · complexity **2** · deps: KW-13, KW-14 · **HG-2, HG-3**
*Outcome:* a scheduled workflow regenerates the bundle and commits it, which the existing `vercel[bot]` integration turns into a production deploy at zero cost.
*Write surface:* `.github/workflows/data-bundle.yml`, `scripts/pipeline/budget.ts`.
*Implementation pointers:*
- **D-17.** `permissions: contents: write` only. `schedule: '17 6 * * *'` **plus `workflow_dispatch`**. `actions/cache` for the clone directory.
- **Always commit**, at minimum a `generatedAt` bump: public repos auto-disable scheduled workflows after 60 days of no repository activity, and this repo has had **zero pushes since 2021-05-31** — it is already the failure case. Scheduled jobs may also be silently dropped under load.
- GitHub Actions is free and unlimited on standard runners for public repos: 6 h runtime, retries, permanent logs, manual re-run. Strictly better than Hobby cron on every axis except "runs inside Vercel".
- `CONTRIB_TOKEN` (HG-3) for the KW-10 half only; the KW-13 half uses no token.
- First-byte budget step: brotli `manifest + repos + grid + ee-00 + pd-00`, fail above **12 KB** (D-07).
- Vercel Hobby: 100 deploys/day (this uses 1), 100 GB Fast Data Transfer/month ≈ 780,000 full-corpus sessions. Not a constraint.
- **Two unknowns to confirm on the first live run:** whether a `GITHUB_TOKEN` commit counts as "repository activity" for the 60-day rule, and whether the Vercel Git integration fires on a `GITHUB_TOKEN` push. Add a belt-and-braces heartbeat if either fails. Note that `GITHUB_TOKEN`-triggered events do not start new workflow runs — so any downstream workflow must use a PAT.
*Acceptance:* a `workflow_dispatch` run produces a commit and a Vercel production deploy; the budget step fails on an oversized first byte; the run is idempotent on unchanged input except `generatedAt`.

### Wave 5 — gates (3 tickets)

**KW-29 — Accessibility gate** · complexity **3** · deps: KW-23, KW-25, KW-26, KW-16, KW-17, KW-18, KW-19, KW-20
*Outcome:* zero `wcag2a/2aa/21a/21aa` axe violations, a real text equivalent for the canvas, and a provable reduced-motion halt.
*Write surface:* `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx`, `lib/viz/tokens/contrast.test.ts`.
*Implementation pointers:* **axe cannot see canvas contents at all** — there is no canvas rule in the Deque 4.10 index. Three things are therefore invisible to it and need explicit tests: canvas `role="img"` + `aria-label` + the D-11 hidden table (which doubles as SSR fallback and SEO surface); canvas-painted contrast asserted by a **pure unit test over the gruvbox token pairs**, not axe; and `prefers-reduced-motion` / WCAG 2.2 SC 2.2.2 (pause control) as an explicit Playwright test. `gray #928374` on `bg0 #282828` is ~4.4:1 — below AA for normal text — so the token's permitted uses must be pinned by the unit test. Regions already own their own semantics (D-05); this ticket **verifies**, it does not sweep.
*Acceptance:* axe clean on `/`; the hidden table contains all day cells and matches the payload; reduced motion provably halts the sim; the contrast unit test fails on a deliberately bad token pair.

**KW-30 — Performance budgets: size-limit hard gate + first-load assertion** · complexity **2** · deps: KW-23, KW-25, KW-28
*Outcome:* deterministic hard budgets that cannot silently regress.
*Write surface:* `.size-limit.json`, `scripts/ci/check-first-load.mjs`, `e2e/lazy-island.spec.ts`.
*Implementation pointers:* `size-limit@13.0.3` + `@size-limit/file` with `running:false` as the **hard** gate: 120 kB brotli app shell, 90 kB canvas island, 12 kB first-byte data, 24 kB CSS. **Do not use `andresz1/size-limit-action`** — it still declares the deprecated `using: 'node20'` runtime and its last release is 2024-04-06; run `npx size-limit --json` directly. Lighthouse CI is **warn** for performance/TBT but **error at 1.0** for accessibility and SEO and **error at 0.05** for CLS, with `pessimistic` aggregation — hard-failing LHCI performance on a shared runner produces false failures that agents learn to disable. Expected viz bundle is ~17 KB gzip (d3-hierarchy pack subset 2.3 KB measured + hand-rolled tween + sim + render + sprites).
*Acceptance:* budgets fail on a deliberate regression; the lazy-island test proves no gource chunk is requested before scroll-into-view; LHCI a11y and SEO are hard-gated at 1.0.

**KW-31 — Visual regression baselines + determinism canary** · complexity **3** · deps: KW-23, KW-24, KW-25 · **HG-2**
*Outcome:* frame snapshots that assert semantics before pixels, with baselines that only one container can produce.
*Write surface:* `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, `playwright.config.ts` (snapshot config), `.github/workflows/snapshots.yml`.
*Implementation pointers:* seek to fixed ticks, assert the `VizFrameInfo` struct (`date`, live repo set, `highlightCell`, draw-call budget) **and only then** screenshot with `maxDiffPixels: 0`. `snapshotPathTemplate` without a platform segment. `await document.fonts.ready` so text never renders in a fallback. **The `--update-snapshots` guard must be `process.argv.some(a => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='))`** (C-23) — the naive form is a no-op. Add a CI step failing any PR diff that touches `e2e/__screenshots__/**` outside the update workflow. Agents regenerate baselines by commenting `/update-snapshots`; the push **must use a PAT**, because a `GITHUB_TOKEN` push never re-runs `e2e` and leaves the PR stuck on a stale red check forever. Include a bit-identical double-render canary and a DPR backing-store assertion.
*Acceptance:* the guard fires outside the container; a `GITHUB_TOKEN`-pushed baseline is provably rejected in review; double-render canary is bit-identical; ~a dozen PNGs total, no Git LFS.

### Wave 6 — capstone (1 ticket)

**KW-32 — Capstone: full-page integration and production deploy verification** · complexity **2** · deps: KW-02, KW-18, KW-19, KW-26, KW-27, KW-29, KW-30, KW-31
*Outcome:* every region composes into one page, all gates are green, and a production deployment is verified live.
*Write surface:* `app/page.tsx` final composition, `README.md`.
*Implementation pointers:* required by the aiur schema — **exactly one capstone**, which must be `epic_acceptance.owner_ticket_id`, must be in `feature_boundary.critical_path_ticket_ids`, must have non-empty `acceptance.human_or_e2e`, and whose transitive `depends_on` closure must contain **every** other runnable ticket. Verify against the live deployment: no route returns `FUNCTION_RUNTIME_DEPRECATED` (the current `/api/hello` does); `server: Vercel` on the apex; the 308 apex→www redirect still works; `last-modified` is CDN cache-fill time and must **not** be used to infer deploy time.
*Acceptance:* production URL serves the assembled page; all required checks green; zero `FUNCTION_RUNTIME_DEPRECATED`; the deployed bundle's `generatedAt` is within 24 h.

---

## 6. Wave diagram

```
HG-1 push origin/main ─── HG-2 workflow scope ─── HG-6 hand-merge wave 1
        │
        v
WAVE 1  ┌─ KW-01 Foundation: toolchain + CI gate            (4) ◀ CRITICAL
 (2)    └─ KW-02 Repo governance / labels / CODEOWNERS      (1)
        │
        v
WAVE 2  ┌─ KW-03 DS CSS + Tailwind bridge + a11y layer      (3)
 (10)   ├─ KW-04 Fonts + SVG control icons                  (2)
        ├─ KW-05 App shell + region contract + 7 stubs      (3)
        ├─ KW-06 Content modules                            (2)  ◀ HG-5
        ├─ KW-07 Ramp + bands + contrast fixtures           (1)
        ├─ KW-08 Viz contract: types/cursors/RNG            (3) ◀ CRITICAL
        ├─ KW-09 Pipeline A: discovery + identity           (2)
        ├─ KW-10 Pipeline B: calendar + private             (2)  ◀ HG-3
        ├─ KW-11 Vitest scaffolding                         (2)
        └─ KW-12 Bundle schema + codec CONTRACT             (3)
        │
        v
WAVE 3  ┌─ KW-13 Pipeline C: clone + extract     [09,12]    (3)
 (11)   ├─ KW-14 Pipeline D: encoder + validator [12,10]    (3)
        ├─ KW-15 Client bundle loader            [12]       (2)
        ├─ KW-16 Region: man page                [05,06,03] (2)
        ├─ KW-17 Region: career git log          [05,06,03] (3)
        ├─ KW-18 Region: header + tmux bar       [05,03,04] (2)
        ├─ KW-19 Region: contact                 [05,06,03] (1)
        ├─ KW-20 Region: boot overlay            [05,06]    (2)
        ├─ KW-21 Viz sim reducer + layout        [08]       (3)
        ├─ KW-22 Viz render modules              [08,07]    (4) ◀ CRITICAL
        └─ KW-23 Playwright + container e2e      [01,11]    (3)  ◀ HG-2
        │
        v
WAVE 4  ┌─ KW-24 Viz driver + harness            [21,22]    (2) ◀ CRITICAL
 (5)    ├─ KW-25 Region: instrument pane         [05,15,24] (3) ◀ CRITICAL
        │        └─ (KW-25 also lands in wave 5 slot if 24 slips)
        ├─ KW-26 Transport bar + game deletion   [24,04,05] (2)
        ├─ KW-27 SEO + OG + resume.txt           [05,06,16,17] (2)
        └─ KW-28 Data workflow (daily)           [13,14]    (2)  ◀ HG-2,3
        │
        v
WAVE 5  ┌─ KW-29 A11y gate           [23,25,26,16-20]       (3)
 (3)    ├─ KW-30 Perf budgets        [23,25,28]             (2)
        └─ KW-31 Visual regression   [23,24,25]             (3) ◀ CRITICAL
        │
        v
WAVE 6  └─ KW-32 CAPSTONE            [02,18,19,26,27,29,30,31] (2) ◀ CRITICAL
 (1)
```

### Verified topological levels

Computed, not asserted — the graph was machine-checked for cycles, unknown references, and capstone-closure completeness. **No cycles; no unknown refs; KW-32's transitive closure covers 31/31 other tickets.**

| Wave | n | Σ cx | Tickets | Fleet width (8 concurrent, GT-14) |
|---|---|---|---|---|
| 1 | 2 | 5 | KW-01 KW-02 | under-utilized — unavoidable, this is the bootstrap |
| 2 | 10 | 23 | KW-03 KW-04 KW-05 KW-06 KW-07 KW-08 KW-09 KW-10 KW-11 KW-12 | **saturated** (10 > 8, ~2 dispatch batches) |
| 3 | 11 | 28 | KW-13 KW-14 KW-15 KW-16 KW-17 KW-18 KW-19 KW-20 KW-21 KW-22 KW-23 | **saturated** (11 > 8, ~2 batches) |
| 4 | 3 | 6 | KW-24 KW-27 KW-28 | assembly tail |
| 5 | 2 | 5 | KW-25 KW-26 | assembly tail |
| 6 | 3 | 8 | KW-29 KW-30 KW-31 | gates |
| 7 | 1 | 2 | KW-32 | capstone, serial by construction |
| **Total** | **32** | **77** | | |

The ASCII diagram above groups levels 4–5 for readability; **this table is authoritative**. Levels 4–7 are narrow by construction — they are the assembly and gating tail, and 73% of the work has already completed in parallel behind them.

Waves 2 and 3 both exceed the fleet cap, which is the correct target: the graph is not the bottleneck, the fleet is.

### Critical path

```
KW-01 (4) → KW-08 (3) → KW-22 (4) → KW-24 (2) → KW-25 (3) → KW-29 (3) → KW-32 (2)
```

**7 nodes, 21 complexity points** out of 77 total — **73% of the work is off the critical path** and can proceed in parallel. KW-31 ties KW-29 at weight 3, so the two are interchangeable as the penultimate node; both are wave-6 gates.

Secondary near-critical chain (data): `KW-01 → KW-12 → KW-14 → KW-28 → KW-30 → KW-32` = 6 nodes, 16 points. It has one node of slack against the viz chain, so a slip in KW-14 or KW-28 does not extend completion.

**How the path was shortened.** Three deliberate re-partitions:
1. **KW-08 as a contract, not an implementation.** Splitting the viz core into a contract (types + cursors + RNG) and an implementation (reducer + layout) lets KW-21 and KW-22 run *in parallel* in wave 3 instead of KW-22 waiting on a proven reducer. Saves one level.
2. **KW-12 as a codec contract.** The pipeline writer (KW-14) and the client reader (KW-15) both depend on the schema, not on each other. Without this they serialize.
3. **KW-05 as a shell with seven stubs.** Five region tickets become independent single-file jobs in the same wave. The alternative — three large tickets each editing `app/page.tsx` — would force `serializes_with` across the widest wave.

**What would shorten it further** (not adopted, recorded for the operator): folding KW-24's driver into KW-22 saves one node but makes KW-22 complexity 5, which GT-14 shows gets no elevated turn budget. Net expected time is worse.

### Write-surface partition (proof of D-05)

No two same-wave tickets share a file. Ownership is exclusive and permanent:

| Surface | Sole owner |
|---|---|
| `package.json`, `package-lock.json` | KW-01 — **frozen thereafter** (D-03) |
| `app/globals.css`, `styles/**` | KW-03 |
| `app/layout.tsx`, `app/page.tsx`, `app/regions/_contract.ts` | KW-05 (KW-27 appends only the metadata export; KW-32 the final composition — both later waves) |
| `app/regions/<Region>.tsx` | one region ticket each (KW-16…KW-20, KW-25, KW-26, KW-18) |
| `lib/viz/sim/**` | KW-08 (types/cursors/rng), KW-21 (step/layout) — disjoint files |
| `lib/viz/render/**` | KW-22 |
| `lib/viz/tokens/**` | KW-07 |
| `lib/bundle/**` | KW-12 (schema/codec), KW-15 (loader) — disjoint files |
| `scripts/pipeline/**` | KW-09, KW-10, KW-13, KW-14 — disjoint files |
| `.github/workflows/ci.yml` | KW-01 |
| `.github/workflows/e2e.yml` | KW-23 |
| `.github/workflows/data-bundle.yml` | KW-28 |
| `.github/workflows/snapshots.yml` | KW-31 |
| `.github/CODEOWNERS`, `AGENTS.md`, rulesets | KW-02 |

**Result: `serializes_with` is empty for every ticket.** This matters concretely — C-11 established that `serializes_with` is the one edge type aiur does *not* enforce at runtime, so any plan relying on it would be both slower and unsafe.

---

## 7. Execution notes for the Executor

1. **Publish with `publish_build_order.py`, never `gh issue create`** (D-13). `depends_on` is enforced at runtime only as GitHub-native issue dependencies written by the publisher and gated by `DispatchPolicy.todo_issue_blocked_by_non_terminal?`. Hand-created issues silently discard the entire graph.
2. **The blocker gate fires only when an issue normalizes to `todo`.** An issue in `agent:rework` skips that call site — so a reworked ticket can dispatch ahead of its dependencies. Watch reworks on KW-08, KW-12 and KW-22 specifically, since those are contracts others build against.
3. **`aiur --todo` takes GitHub issue numbers** (regex `^\d+$`), not logical ticket IDs.
4. **Capstone constraint:** exactly one capstone (KW-32), it must be `epic_acceptance.owner_ticket_id`, must appear in `feature_boundary.critical_path_ticket_ids`, must have non-empty `acceptance.human_or_e2e`, and its transitive `depends_on` closure must cover every other runnable ticket. The KW-32 dependency list above satisfies this.
5. **`build-order.json` uses a CLOSED schema** — every root/ticket/nested key is both required *and* exclusive. Missing keys error; unknown keys error. A partially-specified file cannot validate.
6. **Edge-type rules:** `serializes_with` must be symmetric; `suggested_after` must not be bidirectional; a given unordered pair may carry only ONE edge type across `depends_on`/`serializes_with`/`suggested_after`/`contains`. Since D-05 leaves `serializes_with` empty, only `depends_on` is in play.
7. **`design_evidence` paths reject `..`, absolute paths, symlinks and `.git` components**, and resolve relative to `build-order.json`'s directory. Pinning `docs/design/kevinweaver.dev.dc.html` requires **copying it into the pack's `evidence/` directory** and hashing the copy.
8. **Config unknown keys fail OPEN** — Ecto `cast` silently ignores unknown keys, so a typo like `max_concurent_agents` produces no error and silently uses the default. Two exceptions: `polling.interval_ms` raises, and `opencode.db_path`/`prewarm_workspace` are read out-of-band from raw YAML.
9. **Leave `opencode.bridge_port` unset** (C-12). The on-disk config already has no `opencode` section, which is correct — the `:default` source auto-selects a free port, whereas pinning converts a recoverable collision into a hard startup error.
10. **Branch names** are `aiur/<issue-number>` or `aiur/<issue-number>-<≤4-word-slug>`; agents must read `git branch --show-current` and never reconstruct the ref.
11. **Complexity 4 tickets get no elevated turn budget** (GT-14: `max_turns_by_complexity` defines only 1/2/3 → 4/8/12, and `max_turns: 12` is the fallback). KW-01, KW-22 are the two complexity-4 tickets. Consider adding `4: 20, 5: 28` to `.aiur/config` before dispatch, or expect reworks on those two.
12. **Aiur does not use git worktrees** — each agent gets a full `git clone`, with prewarm materializing copy-on-write from `~/.aiur/repo/<owner>/<name>`. The prewarm base build runs `npm ci`, so KW-01's lockfile must be correct or every subsequent agent workspace is poisoned.

---

## 8. Things deliberately NOT in this plan

| Item | Why |
|---|---|
| Bomberman / arcade game | Cut by the user. KW-26 deletes the ~65 lines and frees Space. |
| Live view, WebSocket, polling, real-time transport | Cut by the user. D-14 keeps only an honest `generatedAt`-driven freshness pill. |
| Framework swap (Astro / Vite) | User decision: it stays a Next.js app. |
| Reversing the animation | **Already implemented in the comp** (`day = N-1`, `day -= sp*dt`, wrapping at 0). No ticket budgets for it; the real work is newest-first chunked loading (KW-12/KW-15). |
| Fetching the design system from DesignSync | GT-5 / C-3: 9 of 10 files are already on disk and committed. D-04 removes the last dependency. |
| `NODE_OPTIONS=--openssl-legacy-provider` | C-4: the real failure is a postcss exports-map error; the flag does not fix it. |
| Checkpoint bitsets for seek | O(n) rescan is 9.7 µs; 18 KB of bitsets buys nothing. |
| `d3-force` | 9.25 KB for a 20-node layout already solved exactly by a deterministic ellipse. |
| GSAP | 28.3 KB gzip, no LICENSE file in the tarball, mutable licence URL, and the prototype uses no tween library. |
| Pruning zero-commit repos | C-8: saves 145 → ~124 MB, not → 50 MB, against a 40–45 s cold clone. Not worth the complexity. |
| Vercel Cron / Blob / Global Config | D-17 + C-29. Global Config caps at 1 MB and 100 writes/month on Hobby. |
| Merge queue | Structurally unavailable on a User-owned repo (GT-11). |
| React Compiler | Off by default, relies on Babel (defeating Turbopack), and a ~1000-line site with one memo-sensitive canvas gains nothing. |
| A cross-cutting a11y sweep ticket and a cross-cutting mobile sweep ticket | D-05: both would touch every region file and serialize the two widest waves. Folded into each region's acceptance criteria, with only the *global* primitives in KW-03. |

---

## 9. Open questions that do NOT block execution

Recorded so they are not re-litigated mid-flight. Each has a stated default.

- **Private cluster shape** — one circle (comp: vol 5271, 26 dotted files) or split per-year (measured private totals are per-year: 105/86/1028/2360/998)? *Default: one circle; per-year is a visual refinement.*
- **`--fs-hero` / `--fs-stat`** have no home in the current comp. *Default: keep them in the scale, re-derived; add a hero stat block only if the design asks for it.*
- **Third actor class** for Claude/Codex co-author trailers (531 + 45 occurrences measured, already in the clone at zero extra cost). *Default: no — two actors per ground truth.*
- **The 91 uncredited bare-noreply commits** — real work GitHub does not credit. Including them makes the animation ~9% busier than the grid. *Default: include in the animation, exclude from the grid, and say so in the manifest.*
- **The ~5% grid double-count** from commits co-authored by both actors. *Default: accept it, so the site's number matches what both GitHub profiles display.*
- **Non-default-branch commits** — `--all` gives 3,593 for aiur vs 1,257 on HEAD. *Default: `--all`, recorded in the manifest.*
- **Ghost outlines for dead repos** cost ~0.3 ms/frame and are untested. *Default: ship them (D-10); they are the mitigation that makes lifespan semantics acceptable.*
- **Playback speed set** `[4,8,12,20,32]` days/s may not be the sweet spot under reverse + lifespan semantics. *Default: keep; duration is deliberately unpinned per ground truth.*
- **All canvas numbers are Chromium SwiftShader software raster.** *Default: treat the §7 caps as conservative; re-measure on GPU before hardening.*
- **`_ds_bundle.js` and `docs/design/support.js`** (69 KB) — runtime-required or deck-only? *Default: deck-only; nothing in the ported CSS references them.*
- **Adopt the DS's own `_adherence.oxlintrc.json`** as a second lint pass? *Default: no for now; revisit after KW-03 lands.*

---

## 10. Provenance

Every (M) claim in §1 was executed in this session against the live repo, the live GitHub API and the live network. Every correction in §2 traces to a named verifier verdict in one of the eight track documents, with the rule "where a verifier refuted a claim, the correction wins" applied without exception. Where two verifiers disagreed with each other (none did materially), or where a verifier's correction was itself checkable, I re-measured — that is the origin of GT-1 through GT-17.

The two largest changes to the aggregate plan are not in any single track:
- **The SAML discovery (GT-1/GT-3)** was reachable only by cross-reading content-ia's verifier against data-pipeline's auth assumption and then re-running both queries. It resolves four contradictions at once and creates human gate HG-3.
- **The `package.json` freeze (D-03)** emerges only from looking at all eight ticket seed lists together and noticing that seven of them add dependencies.
