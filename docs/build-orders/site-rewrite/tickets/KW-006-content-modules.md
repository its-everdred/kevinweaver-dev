# KW-006 — Content modules: resume, man page, career log, identity, boot

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Five typed data modules with no rendering and no runtime behaviour; the work is transcription against an authoritative resume onto a fixed five-file write surface, but the no-literals rule (DEC-008) and the privacy scrub (DEC-015) make the verification burden real.

**Risk:** medium — this is the factual surface of the site. A wrong employer date, an invented era, or a hardcoded contribution figure ships as a false claim on the operator's public resume. Contained by grep-based acceptance, by GATE-005 resolving the six unmeasurable facts before pickup, and by a write surface no other ticket touches.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-003, REQ-007, REQ-008

**Decisions:** DEC-004, DEC-008, DEC-015

**Gates:** GATE-005

**Workstream:** content

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

Every content string the site will render exists as typed data under `content/`, with zero placeholder copy, zero invented employers, zero hardcoded contribution figures, and no personal phone number anywhere in the repository or the build output.

## Context and evidence

The design comp is the only copy the project has, and its copy is wrong. Measured at `e664d73a195facd64db58ba10952170ff01b4772` against `docs/design/kevinweaver.dev.dc.html` (1,033 lines, GT-13):

- The man-page pane (comp lines 128–145) claims `kevin weaver — ethereum infrastructure, developer tooling, agent runtimes` and a DESCRIPTION naming `the front end of ethereum.org and the ethereum foundation site`. Measured reality is 1 commit + 1 PR to `ethereum/ethereum-org-website` (2023) and 1 PR to `ethereum-foundation-website` (2026). That is a drive-by, not an era.
- The git-log pane (comp lines 146–159) has **five** `.commit` rows, one of which (line 153) carries the hash `0xc0de1` — **not valid hex**, because `x` is not a hex digit. The exact audience this site targets will notice. It also omits the current employer entirely: `grep -ic optimism` over the comp returns **0**.
- The contact pane (comp lines 162–170) has two wrong facts and two `href="#contact"` dead anchors.
- The tmux position segment hardcodes `☰ 1826/1826` (comp line 178) while `buildData()` starts the window at `Date.UTC(2021, 7, 1)` (comp line 273) and `prepBoot()` prints `4,817 contributions · busiest 284 · 17 zero days` (comp line 428) and `quantile rejected: 156-day mass point at n=1` (comp line 430). Three mutually inconsistent windows in one file.

**C-18 (resolution: verifier wins).** The comp's copy is *not* 100% placeholder: `2021–22 consensys · truffle` is correct, and both GitHub contact tiles are correct — do not churn them. The git-log pane grows **5 → 8 rows, not 9**. `design-comp-spec §7.2` is titled "9 rows" but its own table is numbered 1–8; the correction says fix the heading, and the eight-entity set is what ships.

**C-1 / C-2 / C-3 (SAML).** GT-1: the local `gh` token is not SAML-SSO-authorized for `ethereum-optimism`, so every authenticated contribution measurement in the research tracks is ~25% low, and `search(author:its-everdred org:ethereum-optimism)` silently returns `issueCount: 0`. `content-ia` C1 refutes its own §3: `ethereum-optimism/actions` is **public**, 31 stars, and `its-everdred` is its top contributor with 2,198 commits. Consequence for copy: **do not ship** `content-ia` §5.2's Optimism commit-body line "this branch is not merged. It is still being written" as a claim of *no public evidence*, and do not describe the Optimism role as evidence-free. It is the strongest node on the site. The gag about an unmerged branch is fine as a branch-model joke; the "no public evidence" framing is not.

**DEC-008 (D-08).** No contribution figure is a literal anywhere in copy. Every number reads from the `generatedAt`-stamped payload. This ticket implements the copy half of that rule: `content/boot.ts` ships templates with `{token}` placeholders and a substitution function, never integers. C-20 makes the same point for the repo count — GT-7 gives five defensible values (77 / 77 / 50 / 85 / 22) and none of them is `content-ia` §9's "58", so the boot line reads the count and its definition from the payload.

**DEC-015 (D-15).** The phone number `856-723-2521` must never enter the repository or the build output. `content-ia` §11.1: it is a live personal number tied to a South Jersey area code on a resume that states California, i.e. almost certainly a legacy account-recovery factor for someone who publicly works on crypto infrastructure. Obfuscation, image rendering and JS assembly all fail against standard scraping pipelines. Omit entirely.

**DEC-004 (D-04).** Control glyphs become inline SVG icons owned by KW-004. The relevant consequence here is negative: content modules carry **semantic markers, not glyph literals**, so a codepoint the shipping font lacks is a renderer problem, not a data problem. `content-ia` §14 flags `⏸ ▶ ⏮ ⏭ ✉ ☰ ⠿ ◉ ◆ ★` as unverified against Google-hosted JetBrains Mono.

**GT-12 (codepoint budget).** Re-measured this session over the whole comp: exactly **16** distinct non-ASCII codepoints and **zero** in the PUA range U+E000–U+F8FF. The full set is `·` U+00B7, `—` U+2014, `•` U+2022, `–` U+2013, `◆` U+25C6, `●` U+25CF, `→` U+2192, `⏸` U+23F8, `☰` U+2630, `⠿` U+283F, `◉` U+25C9, `⏮` U+23EE, `⏭` U+23ED, `✉` U+2709, `★` U+2605, `▶` U+25B6. All copy in `content/` is restricted to ASCII plus this set. Note that `◍` U+25CD — which `design-comp-spec` §7.2 suggests for the root commit glyph — is **not** in the set, which is why the root row is a boolean flag and not a glyph string.

**GATE-005 (HG-5).** Six facts about Kevin that no measurement can settle block this ticket: (a) Twitter `@kevin_weaver` (authoritative resume) vs `its_everdred` (the measured, self-set GitHub `twitterUsername` field, C-13); (b) which email ships — the resume's `notkevinweaver@gmail` has **no TLD** and is not a valid `mailto:`, `kevinweaver2@gmail.com` is a personal recovery address that must not be published without an explicit "yes", and `kevin@kevinweaver.dev` is recommended (the domain already runs Namecheap email forwarding — five live MX records — so the alias is a registrar-panel row, not a new service; whether `kevin@` is already configured is not determinable from DNS); (c) job title, three conflicting variants; (d) whether the `side` lane (aiur, gary, etherguild) appears at all; (e) name the podcast or cut `--podcast`; (f) the availability string for the contact STATUS block. This gate blocks pickup.

**Requirements this ticket serves.** REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure), REQ-007 (no personal data reaches the repository or the build output), REQ-008 (the site has real indexable text; `content/` is the single source `/resume.txt`, `/kevinweaver.1` and the `<noscript>` fallback generate from).

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (pack-relative `../README.md`) — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Graph and wave analysis:** `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md` §5 "Ticket set", §6 "Wave diagram", "Verified topological levels", "Critical path", "Write-surface partition (proof of D-05)".
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (pack-relative `../03-technical-decisions.md`), sourced from the synthesis §3 decision table D-01…D-17 and §4 human gates HG-1…HG-7.
- **This ticket's upstream pointers:** the synthesis §5 entry **"KW-06 — Content modules: resume, man page, career log, identity, boot"**, expanded below in "Refreshable implementation notes".
- **Copy sources (verified present at the researched commit):** `docs/research/2026-07-31-content-ia.md` and `docs/research/2026-07-31-design-comp-spec.md`. In both files the appended `## Verification corrections` / `## Verification corrections`-equivalent section **overrides the body of its own document**.

## Scope

- Create `content/resume.ts`: the authoritative employment record as typed data — all seven entities, newest first, with org, qualified name, title, start/end months, location, stack and achievements.
- Create `content/manpage.ts`: the full `man kevinweaver` page as an ordered section/block structure plus the abridged variant flag for the sub-1080px pane.
- Create `content/career-log.ts`: exactly eight collapsed git-log rows with deterministic hex short SHAs, `.ref` decorations, lane/branch model, contrast-safe hue tokens, and the expanded commit body for each row.
- Create `content/identity.ts`: person-level facts — name, title, location, timezone, the two actors, the contact link set with visible accessible labels, and the `whoami` / `id` / `finger` block.
- Create `content/boot.ts`: the sixteen cold-start log lines as `{token}` templates, the token vocabulary, and a pure `fill()` substitution function that throws on an unresolved token.
- Enforce DEC-008 inside `content/`: no contribution, repo-count, day-count or streak figure exists as an integer literal.
- Enforce DEC-015 inside `content/` and the build output: the string `856-723-2521` appears nowhere.
- Restrict every string in `content/` to ASCII plus the sixteen non-ASCII codepoints GT-12 measured in the comp.

## Non-goals

- Rendering anything. `app/regions/ManPage.tsx`, `CareerLog.tsx`, `Contact.tsx` and `BootOverlay.tsx` belong to KW-016, KW-017, KW-019 and KW-020; the stubs and `app/regions/_contract.ts` belong to KW-005.
- `/resume.txt`, `/kevinweaver.1`, `app/layout.tsx` metadata, the OG image and the `<noscript>` fallback — all KW-027.
- The tmux status-bar segment copy (`content-ia` §8). KW-018 owns `app/regions/TmuxBar.tsx` and does **not** depend on this ticket; it reads its figures straight from the payload. Do not add tmux segments to `content/`.
- The repo array, the contribution grid, the commit-event stream and every actual number. C-19: the DATA track owns the repo array (`{id, short, actor, vol, stars, from, to, private, ext[]}`), emitted by KW-012/KW-013/KW-014; the calendar and the private aggregate come from KW-010.
- CSS, tokens, the design-system vendoring and `app/globals.css` — KW-003. Icons and SVG sprites — KW-004.
- Any edit to `package.json` or `package-lock.json`. DEC-003 freezes both after KW-001; this ticket adds no dependency and needs none.
- Test-runner wiring. KW-011 owns `vitest.config.mts` and `test/`. Acceptance here is grep plus `npm run typecheck`.
- Editing or deleting `docs/design/kevinweaver.dev.dc.html`. It is a design artifact and stays as the record of what was replaced.

## Existing owner and reuse target

`content/` does **not** exist at `e664d73a195facd64db58ba10952170ff01b4772` — verified with `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772`, whose non-`docs/` paths are the pre-rewrite Pages Router site (`pages/`, `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `yarn.lock`, `package.json` still named `with-tailwindcss`). This ticket creates the directory.

The TypeScript project this code compiles under is created by **KW-001**, not by this ticket:

- `tsconfig.json` — expected to enable `strict` and `noUncheckedIndexedAccess` and to declare the path alias `"@/*": ["./*"]`. **Verify at pickup by reading the file.** If the alias is absent, use relative imports. Do not create or edit `tsconfig.json`; KW-001 owns it.
- `package.json` scripts `typegen`, `typecheck`, `lint`, `build`, and `next@16.2.12` / `react@19.2.8` / `typescript@5.9.3` / `eslint@9.39.5` (C-15: pin ESLint 9, **not** 10.x; pin TypeScript 5.9.3, **not** `latest`).
- If the base branch has no `tsconfig.json`, KW-001 has not merged. Stop and report; do not bootstrap it.

Reuse targets that **do** exist at the researched commit:

| Target | Path | What it gives this ticket |
|---|---|---|
| The comp | `docs/design/kevinweaver.dev.dc.html` | the copy being replaced, and the codepoint budget (GT-12) |
| `.commit .ref` slot | `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/data.css` line 5 — `.commit .ref{flex:0 0 auto;color:var(--text-faint);}` | the purpose-built, never-used slot for git decorations such as `(HEAD -> optimism, tag: role/optimism)` |
| Gruvbox tokens | `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` lines 5–14, 26 | the `LogHue` value set and the AA contrast facts below |
| Man page copy | `docs/research/2026-07-31-content-ia.md` §4, fenced block **lines 154–350**; abridged variant **lines 359–374** | transcribe verbatim, subject to the deltas below |
| Git log copy | same file, §5.2 fenced block **lines 397–689**; optional `side` lane §5.3 **lines 697–742**; collapsed row table §5.4 | commit bodies and the collapsed-row field mapping |
| `whoami` copy | same file, §6 fenced block **lines 775–801** | the `whoami` / `id` / `finger -l` block |
| Contact copy | same file, §7 fenced block **lines 820–835** | the labelled REACH ME row and the STATUS block |
| Boot copy | same file, §9 fenced block **lines 904–921** | the sixteen boot lines |
| Row table, hues, SHAs | `docs/research/2026-07-31-design-comp-spec.md` §7.2 | the eight-row table with hue assignments and the deterministic short-SHA derivation |

## Contract and invariants

This ticket is a **producer** for five consumers: KW-016 (man page pane), KW-017 (career git-log pane), KW-019 (contact pane), KW-020 (boot overlay) and KW-027 (SEO, `/resume.txt`, `/kevinweaver.1`, `<noscript>`). Those tickets quote the interface sketch below verbatim; do not rename an exported symbol without a plan revision.

Invariants that hold for the whole module set:

1. **Data only.** No JSX, no React import, no `next/*` import, no DOM reference, no I/O. Every module must import cleanly in plain Node.
2. **No figure literals (DEC-008).** No integer in `content/` may be a contribution count, active-day count, zero-day count, repo count, star count, streak or window length. Years, month numbers, ISO dates, roff column widths and array indices are permitted.
3. **No glyph literals for anything a renderer chooses.** Markers are semantic (`marker`, `root`, `hue`, `lane`); the glyph or SVG is picked by KW-004/KW-017/KW-020.
4. **Codepoint budget.** ASCII plus exactly the sixteen codepoints in GT-12.
5. **Accessible names are content.** Every link carries a visible `label`; nothing relies on a `title=` attribute.
6. **Everything is `readonly` / `as const`.** Consumers are server components rendered at build time and must not mutate.
7. **No cross-imports out of `content/`.** `content/manpage.ts` may import `fill` from `content/boot.ts`; nothing else in `content/` imports anything outside it.

Interface sketch — consumers quote this verbatim:

```ts
// ── content/identity.ts ──────────────────────────────────────────────────────
export type ActorId = 'its-everdred' | 'its-applekid';

export interface Actor {
  readonly id: ActorId;
  readonly kind: 'human' | 'agent';
  readonly url: string;          // 'https://github.com/its-everdred'
  readonly since: string;        // ISO date, 'YYYY-MM-DD'
  /** Renderer picks the glyph/SVG (◉ human, ◆ agent). Never a glyph literal here. */
  readonly marker: 'human' | 'agent';
}

export type LinkId =
  | 'github-human' | 'github-agent' | 'email' | 'linkedin' | 'twitter';

export interface IdentityLink {
  readonly id: LinkId;
  /** Visible text and the accessible name. Never a `title=` attribute. */
  readonly label: string;
  readonly href: string;
  /** Always includes 'me' (IndieWeb). Externals also carry 'noopener'. */
  readonly rel: readonly string[];
  readonly external: boolean;
  /** Right-hand annotation in the REACH ME row, or null. */
  readonly note: string | null;
}

export interface FingerField {
  readonly label: string;        // 'Login' | 'Name' | 'Title' | 'Since' | ...
  readonly value: string;
}

export interface Identity {
  readonly name: string;                       // 'Kevin Weaver'
  readonly title: string;                      // GATE-005 (c)
  readonly location: string;                   // 'California, USA' — never narrower
  readonly timezone: string;                   // 'America/Los_Angeles'
  readonly site: string;                       // 'kevinweaver.dev'
  readonly email: string;                      // GATE-005 (b)
  readonly actors: readonly Actor[];
  readonly links: readonly IdentityLink[];
  /** `$ whoami` output — one word. */
  readonly whoami: string;                     // 'its-everdred'
  /** `$ id` output, pre-wrapped. */
  readonly idLines: readonly string[];
  /** `$ finger -l` header fields, two per rendered row. */
  readonly finger: readonly FingerField[];
  /** finger `Project:` block, one entry per line. */
  readonly project: readonly string[];
  /** finger `Plan:` block, one entry per line. */
  readonly plan: readonly string[];
  /** Contact STATUS block. GATE-005 (f). */
  readonly status: readonly string[];
  /** The two closing `curl` lines of the contact pane. */
  readonly curlLines: readonly string[];
}

export const IDENTITY: Identity;

// ── content/resume.ts ────────────────────────────────────────────────────────
export type EntityKind = 'role' | 'founder' | 'education';

export interface Employer {
  readonly key:
    | 'optimism' | 'metropolis' | 'consensys' | 'stitch-fix'
    | 'ems-heroes' | 'omni' | 'rowan';
  /** Display name. This exact string is the first field of the short-SHA input. */
  readonly org: string;                        // 'Optimism', 'Omni Developers', ...
  /** First-mention disambiguator, or null. C-12.4: 'Metropolis (0xmetropolis)'. */
  readonly orgQualified: string | null;
  readonly kind: EntityKind;
  readonly title: string;
  readonly start: string;                      // 'YYYY-MM'
  readonly end: string | null;                 // null == current
  readonly location: string;
  readonly stack: readonly string[];
  readonly achievements: readonly string[];
  readonly evidence: readonly { readonly label: string; readonly href: string }[];
}

/** Newest first. Exactly seven entries. */
export const EMPLOYERS: readonly Employer[];

// ── content/career-log.ts ────────────────────────────────────────────────────
/** Contrast-verified against the pane surface #1d2021. 'gray' is deliberately absent. */
export type LogHue =
  | 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'fg4';

export interface CareerCommit {
  /** 7 lowercase hex chars. sha1(`${org}:${startMonth}`).slice(0, 7). */
  readonly hash: string;
  /** Rendered into the DS `.commit .ref` slot. null renders no slot. */
  readonly ref: string | null;
  /** `.cyear` column, e.g. '2025–26'. En dash U+2013 is inside the budget. */
  readonly years: string;
  /** `.cmsg` bold lead. */
  readonly title: string;
  /** `.cmsg` detail. */
  readonly detail: string;
  /** Chip row; [] renders no chips. */
  readonly stack: readonly string[];
  /** Drives both the `.graph` bullet colour and the `.hash` colour. */
  readonly hue: LogHue;
  readonly lane: 'main' | 'role' | 'side' | 'education';
  /** Root commit: renderer suppresses the trailing `.rail` and picks a root glyph. */
  readonly root: boolean;
  /** Expanded `<details>` body. One entry per line, already wrapped. */
  readonly body: readonly string[];
  /** Pre-web3 rows collapse behind `<details>` below 720px. */
  readonly preWeb3: boolean;
}

/** Newest first. Exactly eight entries. */
export const CAREER_LOG: readonly CareerCommit[];
export const CAREER_LOG_PANE_TITLE: string;   // 'git log --graph --decorate --all'
export const CAREER_LOG_HEAD: string;         // 'HEAD -> optimism'

// ── content/manpage.ts ───────────────────────────────────────────────────────
export type ManSectionId =
  | 'NAME' | 'SYNOPSIS' | 'DESCRIPTION' | 'OPTIONS' | 'ENVIRONMENT' | 'FILES'
  | 'EXAMPLES' | 'DIAGNOSTICS' | 'SEE ALSO' | 'AUTHOR' | 'REPORTING BUGS' | 'BUGS';

export interface ManBlock {
  /** The option, path or variable being defined; null for a plain paragraph. */
  readonly term: string | null;
  /** Body lines wrapped at 78 columns. Leading indent is NOT included. */
  readonly lines: readonly string[];
  /** roff indent: 7 for section bodies, 14 for term bodies. */
  readonly indent: 7 | 14;
  /** true renders inside <pre> (shell transcripts under EXAMPLES). */
  readonly literal: boolean;
}

export interface ManSection {
  readonly id: ManSectionId;
  readonly blocks: readonly ManBlock[];
  /** false drops the section from the sub-1080px abridged variant. */
  readonly abridged: boolean;
}

export const MAN_PAGE: readonly ManSection[];
export const MAN_WRAP_COLUMNS: 78;
/** center carries the `{date}` token; resolve with fill(). */
export const MAN_HEADER: { readonly left: string; readonly center: string; readonly right: string };
export const MAN_FOOTER: { readonly left: string; readonly center: string; readonly right: string };
/** Abridged pane footer hint, e.g. '[ press m for full page ]'. */
export const MAN_ABRIDGED_HINT: string;

// ── content/boot.ts ──────────────────────────────────────────────────────────
export type BootKind = 'cmd' | 'ok' | 'warn' | 'dim' | 'agent';

export interface BootLine {
  readonly kind: BootKind;
  /** Leading marker slot. The renderer supplies ⠿ / ◆ or an SVG icon (DEC-004). */
  readonly marker: 'spinner' | 'agent' | null;
  /** ASCII template. Every value is a `{token}`; DEC-008 forbids literals. */
  readonly template: string;
  /** true renders the right-aligned `ok` badge. */
  readonly badge: boolean;
}

export type BootToken =
  // named by the synthesis
  | 'contributions' | 'days' | 'repos' | 'zeroDays'
  // required to keep the remaining boot lines literal-free under DEC-008
  | 'activeDays' | 'busiestCount' | 'busiestDate' | 'massPointDays'
  | 'actors' | 'privateVolumes' | 'agentSince' | 'windowStart'
  | 'repoCountDefinition' | 'date';

/** Exactly sixteen entries, in play order. */
export const BOOT_LINES: readonly BootLine[];
export const BOOT_TOKENS: readonly BootToken[];
export const BOOT_PANE_TITLE: string;          // 'kevinweaver.dev — cold start'

/**
 * Pure `{token}` substitution. Throws on an unresolved token so a missing payload
 * field fails the build instead of shipping `{contributions}` to a visitor.
 */
export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>,
): string;
```

**Freshness and error semantics.** `fill()` is the only place a number enters copy. It must throw — not fall back to an empty string, not leave the brace intact — when a token in the template has no value. That converts a payload-schema drift (KW-012's `manifest.json` losing a field) into a build failure rather than a visible `{days}` on the production site.

**Consumer note for KW-016 / KW-017 / KW-019 / KW-020 / KW-027.** These modules are pure data. Async server components are unsupported by Vitest (`content-ia`-adjacent finding recorded on KW-011), which is exactly why all copy lives here rather than inside components.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read the cited files at pickup; if a line number has moved, the named symbol still governs.

### Files to create — the write surface is exactly these five

```
content/resume.ts
content/manpage.ts
content/career-log.ts
content/identity.ts
content/boot.ts
```

Do **not** add `content/index.ts`, a barrel file, a test file, or a JSON fixture. Consumers import the named exports directly, e.g. `import { CAREER_LOG } from '@/content/career-log';`.

### `content/resume.ts` — the seven entities, newest first

All six employers plus the university, exactly as the synthesis enumerates them:

| `key` | `org` | `kind` | `start` | `end` |
|---|---|---|---|---|
| `optimism` | `Optimism` | `role` | `2025-05` | `null` (present) |
| `metropolis` | `Metropolis` | `role` | `2022-09` | `2025-04` |
| `consensys` | `ConsenSys` | `role` | `2021-09` | `2022-09` |
| `stitch-fix` | `Stitch Fix` | `role` | `2017-12` | `2021-09` |
| `ems-heroes` | `EMS Heroes` | `founder` | `2014-03` | `2017-12` |
| `omni` | `Omni Developers` | `founder` | `2010-02` | `2014-03` |
| `rowan` | `Rowan University` | `education` | `2008-09` | `2012-05` |

`orgQualified` is `'Metropolis (0xmetropolis)'` for `metropolis` (the GitHub org is `0xmetropolis` and hosts `metal`, `contracts`, `subgraph`, `metro-sdk`, so the log and the graph nodes must agree) and `null` for the rest.

Copy corrections that are **mandatory**, each with its evidence:

- **Delete the fictional employer era.** The comp's `2023–24 ethereum foundation web properties` has no corresponding role. Measured: `ethereum/ethereum-org-website` 1 commit + 1 PR (2023), `ethereum-foundation-website` 1 PR (2026). Those years belong to Metropolis. Delete the era; do not edit it.
- **ConsenSys says "now archived."** All Truffle repos live under `ConsenSys-archive/*` today: `truffle` ★13,923, `trufflesuite.com` ★180, `tutorialtoken-box` ★56, `polygon-box` ★39, `arbitrum-box` ★23, `optimism-bridge-box` ★2. A 13.9k-star tool that was sunset is a fact about the ecosystem, not about him — say it rather than letting a reader discover it.
- **Scope the L2 superlative.** The 45 commits to `ConsenSys-archive/optimism-bridge-box` corroborate the resume's L2-bridging claim and arc cleanly into the Optimism role. The `content-ia` verifier (C7) narrows the superlative: `its-everdred/blocktracker-js` has **58 commits in 2021**, so "largest single public body of work in 2021–22" is wrong. Say **"largest in 2022"** or **"largest at ConsenSys"** — nothing wider.
- **Optimism is evidence-rich, not evidence-free.** `ethereum-optimism/actions` is public (31 stars, 22 forks, created 2025-07-18) and `its-everdred` is the top contributor with 2,198 commits. `evidence` for the `optimism` entry carries `actions.optimism.io` and the public repository. Do not carry the "no public evidence" framing from the pre-correction research body.
- **Star counts and commit counts are figures.** They may appear in `evidence[].label` only if they are *repository* facts stated as of the researched commit (e.g. `truffle ★13,923`, which is stable and historical). They may **not** appear as *contribution* figures — no "2,198 commits", no "45 commits" as a live number. When in doubt, phrase it without an integer.

`achievements` bullets come from `content-ia` §5.2 commit bodies, restated in resume voice, one sentence each.

### `content/career-log.ts` — eight rows, deterministic hashes

`hash` is derived, not chosen: `sha1(\`${org}:${startMonth}\`).slice(0, 7)`. Re-verified this session with `printf '%s' "<input>" | sha1sum | cut -c1-7`:

| input string | `hash` |
|---|---|
| `Optimism:2025-05` | `ee787a7` |
| `its-applekid:2026-01-29` | `b85c3e3` |
| `Metropolis:2022-09` | `538d21c` |
| `ConsenSys:2021-09` | `3437755` |
| `Stitch Fix:2017-12` | `3cc4bc6` |
| `EMS Heroes:2014-03` | `79c6a5b` |
| `Omni Developers:2010-02` | `4dc06be` |
| `Rowan University:2008-09` | `9ee7ca6` |

Note the `its-applekid` input uses the **full initialization date** `2026-01-29`, not a bare month; the other seven use `YYYY-MM`. All eight are valid `[0-9a-f]{7}`, all eight are unique, and no two share a 2-character prefix (`ee`, `b8`, `53`, `34`, `3c`, `79`, `4d`, `9e`). Ship these literal strings **and** keep the derivation in a comment so a future edit is checkable. Never ship the comp's `0xc0de1`.

`hue` is contrast-driven, not aesthetic. Ratios re-computed this session against the pane surface `--bg-h #1d2021` (`layers/pane.css` sets `.pane{background:var(--surface-pane)}` and `tokens/colors.css` line 22 sets `--surface-pane:var(--bg-h)`):

| token | value | contrast vs `#1d2021` |
|---|---|---|
| `--yellow` | `#fabd2d` | 9.67 |
| `--green` | `#b8bb26` | 7.94 |
| `--aqua` | `#8ec07c` | 7.79 |
| `--orange` | `#fe8019` | 6.49 |
| `--blue` | `#83a598` | 6.09 |
| `--purple` | `#d3869b` | 5.98 |
| `--fg4` | `#a89984` | 5.90 |
| `--red` | `#fb4934` | 4.77 |
| `--gray` | `#928374` | **4.47 — fails AA, excluded from `LogHue`** |

Row model (DEC-005 keeps this file free of any rendering concern; KW-017 turns it into DOM):

- Roles are branches merged into `main` when the role ends. The current role is an **open, unmerged branch that HEAD sits on** — hence `CAREER_LOG_HEAD = 'HEAD -> optimism'`, and the pane bar drops the comp's `--since=2021` because the log covers the whole career while only the ribbon is five years.
- Row 1 `ref` is `'(HEAD -> optimism, tag: role/optimism)'`; row 2 (`its-applekid`) is `'(tag: agent/its-applekid)'` and `lane: 'side'`; row 8 (Rowan) is `'(tag: rowan/bs)'`, `lane: 'education'`, `root: true`. The remaining rows carry `ref: null`.
- `root: true` suppresses the trailing rail. Do **not** put `◍` in the data — U+25CD is outside the GT-12 budget; the glyph is KW-017's choice.
- `preWeb3: true` on Stitch Fix, EMS Heroes, Omni and Rowan (the four rows that collapse behind `<details>` below 720px).
- Rowan (Sep 2008 – May 2012) and Omni (founded Feb 2010) overlap by two years and run as two live lanes. That overlap is real and is the best moment in the graph — the `lane` field is what lets KW-017 draw it.
- The `its-applekid` row is gated on GATE-005 (d). If the operator cuts the side lane, this row is dropped and the log is seven rows; record that in the PR description because the acceptance count changes.

Worked row (copy this shape):

```ts
export const CAREER_LOG = [
  {
    hash: 'ee787a7',                       // sha1('Optimism:2025-05').slice(0, 7)
    ref: '(HEAD -> optimism, tag: role/optimism)',
    years: '2025–26',
    title: 'Optimism · Actions SDK',
    detail:
      'technical architect — embedded wallets to DeFi protocols; allow and block ' +
      'listing, configuration for assets, markets, chains and infra providers',
    stack: ['typescript', 'hono', 'vite', 'react', 'solidity', 'kubernetes'],
    hue: 'aqua',
    lane: 'role',
    root: false,
    body: [
      'OP Labs. May 2025 - present. Remote, America/Los_Angeles.',
      '',
      'Took "embedded wallets should be able to use DeFi" from a doc to an',
      'interface: one call per action, protocol adapters behind it, policy at',
      'the edge. The hard part was not the transactions. The hard part was',
      'deciding what an action is.',
      '',
      'actions.optimism.io',
    ],
    preWeb3: false,
  },
  // ... seven more, newest first
] as const satisfies readonly CareerCommit[];
```

### `content/manpage.ts`

Transcribe `docs/research/2026-07-31-content-ia.md` §4 (fenced block lines 154–350) into `MAN_PAGE`, one `ManSection` per roff section, in the order NAME / SYNOPSIS / DESCRIPTION / OPTIONS / ENVIRONMENT / FILES / EXAMPLES / DIAGNOSTICS / SEE ALSO / AUTHOR / REPORTING BUGS / BUGS.

Register rules the transcription must keep (`content-ia` §4 closing note):

- **Hyphen-minus, not en dash, in `NAME`** — roff convention. `kevinweaver - lead fullstack software engineer`.
- Section headers are flush-left caps; section bodies indent 7 columns, option bodies 14. Store the text unindented and carry the indent in `ManBlock.indent`.
- Wrap at 78 columns. Store lines **already wrapped**; consumers must not reflow (a reflowed man page reads as broken).
- `abridged: true` on NAME, SYNOPSIS and DESCRIPTION only; §4.1 (lines 359–374) is the abridged variant and `MAN_ABRIDGED_HINT` carries its footer hint.
- `MAN_FOOTER.center` is the `{date}` token, resolved through `fill()`, so the page footer never goes stale. `MAN_HEADER` is `KEVINWEAVER(1)` / `General Commands Manual` / `KEVINWEAVER(1)`.

GATE-005-dependent content inside the man page: `--podcast` (e) — if the operator has no nameable podcast, delete the whole `--podcast` block from OPTIONS rather than shipping an unlinkable credential; the AUTHOR line and the `SEE ALSO` contact pointer take the resolved email (b); the NAME gloss takes the resolved job title (c).

Content corrections: the `ENVIRONMENT KW_ACTOR` and `BUGS` blocks disclose `its-applekid` explicitly — keep them and make them louder, not quieter (`content-ia` §11.4). The `EXAMPLES` block's truffle line says "13,900 stars"; use the measured `13,923` or drop the figure.

### `content/identity.ts`

Transcribe §6 (lines 775–801) for `whoami` / `idLines` / `finger` / `project` / `plan`, and §7 (lines 820–835) for `links` / `status` / `curlLines`.

- `whoami` is `'its-everdred'`; `uid=2010` in `idLines` is the year the career starts, **not** a birth year.
- `messages off` is a real `finger` field and stays.
- `Since: Feb 2010` is correct for the person and deliberately does not match the GitHub account, which was created `2011-09-01T23:00:16Z`. If that reads as an inconsistency, add a `GitHub since: Sep 2011` field — do not change `Since`.
- `location` is `'California, USA'`. Do **not** narrow to a city (`content-ia` §11.3).
- `actors` is exactly two: `its-everdred` (`human`, `since: '2011-09-01'`) and `its-applekid` (`agent`, `since: '2026-01-29'`).
- `links` is five entries: `github-human` → `https://github.com/its-everdred`, `github-agent` → `https://github.com/its-applekid`, `email` → the GATE-005 (b) address, `linkedin` → `https://linkedin.com/in/kevinweaver`, `twitter` → the GATE-005 (a) handle. Every entry carries `rel: ['me']` (externals add `'noopener'`). Both GitHub entries are already correct in the comp — transcribe them, do not churn them (C-18).
- `kevinmweaver.com` is **not** a link. HTTPS times out; HTTP 302s to a Yat handle via a Namecheap URL forward. It stays out of `links` unless GATE-005 says otherwise.
- `status` is GATE-005 (f). `curlLines` are `$ curl -sL kevinweaver.dev/resume.txt` and `$ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -`; KW-027 makes both route targets real.

### `content/boot.ts`

Sixteen lines, in the order of `content-ia` §9 (lines 904–921), replacing the comp's `prepBoot()` (comp lines 421–435). Kinds map to the existing colour table — `cmd` → `--fg1`, `ok` → `--green`, `warn` → `--yellow`, `dim` → `--fg4` — plus one new kind `agent` → `--purple`.

Every figure becomes a token. The synthesis names four (`{contributions}`, `{days}`, `{repos}`, `{zeroDays}`); the remaining tokens exist because DEC-008 admits no exception and the sixteen lines contain more than four numbers. Worked example:

```ts
export const BOOT_LINES = [
  { kind: 'cmd',   marker: null,      template: '$ boot --target=kevinweaver.dev', badge: false },
  { kind: 'ok',    marker: null,      template: '  swe-rts-terminal · gruvbox dark medium · jetbrains mono', badge: true },
  { kind: 'cmd',   marker: null,      template: '$ mount /dev/github its-everdred its-applekid', badge: false },
  { kind: 'ok',    marker: null,      template: '  {actors} actors · {repos} {repoCountDefinition} repos · {privateVolumes} redacted volume', badge: true },
  { kind: 'cmd',   marker: null,      template: '$ fetch contributions --since={windowStart} --merge=sum-per-day', badge: false },
  { kind: 'ok',    marker: 'spinner', template: '{contributions} contributions across {days} days', badge: true },
  { kind: 'dim',   marker: null,      template: '  {activeDays} active · busiest {busiestCount} on {busiestDate}', badge: false },
  { kind: 'cmd',   marker: null,      template: '$ bin --log2 --steps=10', badge: false },
  { kind: 'warn',  marker: null,      template: '  quantile rejected: {massPointDays}-day mass point at n=1', badge: false },
  { kind: 'ok',    marker: null,      template: '  doubling bands accepted', badge: true },
  { kind: 'cmd',   marker: null,      template: '$ seek --to=now --reverse', badge: false },
  { kind: 'dim',   marker: null,      template: '  playback runs backwards. newest first.', badge: false },
  { kind: 'dim',   marker: null,      template: '  the longer you stay, the further back you get', badge: false },
  { kind: 'agent', marker: 'agent',   template: 'its-applekid online since {agentSince}', badge: false },
  { kind: 'cmd',   marker: null,      template: '$ render whoami arc contact', badge: false },
  { kind: 'ok',    marker: null,      template: '  ready.', badge: false },
] as const satisfies readonly BootLine[];
```

Note that `{zeroDays}` does not appear above; if the operator wants the zero-day figure in the boot log, put it on the `{activeDays}` line — do **not** delete the token from `BootToken`, because KW-020 and KW-027 both reference the vocabulary. The `⠿` spinner and the `◆` agent diamond are **not** in any template; they are the `marker` field, so KW-004 can substitute an SVG if the shipping font lacks the codepoint (`content-ia` §14 lists `⠿` as unverified against Google-hosted JetBrains Mono).

`fill()` sketch — ~10 lines, no dependency:

```ts
const TOKEN = /\{([a-zA-Z]+)\}/g;

export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>,
): string {
  return template.replace(TOKEN, (_match, name: string) => {
    const value = values[name as BootToken];
    if (value === undefined) {
      throw new Error(`content/boot: unresolved token {${name}}`);
    }
    return value;
  });
}
```

### What "no figure literal" means in practice

Permitted integers in `content/`: years (`2010`), month numbers, ISO date strings, `MAN_WRAP_COLUMNS = 78`, `indent: 7 | 14`, and historical repository star counts stated as evidence. Forbidden: any contribution count, active/zero-day count, streak, day-count window, repo count, or per-actor total. The comp's `1,826`, `4,817`, `284`, `17`, `156`, `10,001`, `2,038`, `8,515`, `1,486`, `58` are all forbidden — every one of them is either mock-generator output (comp line 323's own comment says the boot figures are "trimmed to the real 4,817 total", which the `content-ia` C4 correction refutes: measured 370-day reality is 7,933 contributions / 3 zero days / 69 days at n=1) or a SAML-deflated measurement (C-3: the authenticated calendar reports 2026 = 2,791 where the public profile reports 4,838).

## Acceptance and verification

### Agent gate

- `grep -rn '856-723-2521' . --exclude-dir=node_modules --exclude-dir=.git` returns nothing, and after `npm run build` the same grep over `.next/` and `public/` also returns nothing.
- No contribution integer literal exists in `content/`: every numeric literal in the five files is a year, a month, an ISO date, a roff column width, or an array index — verified by reading the output of `grep -rnE '[0-9][0-9,]{2,}' content/` line by line and confirming each hit against the permitted list.
- Every employer from the authoritative resume is present in `content/resume.ts`: Optimism, Metropolis, ConsenSys, Stitch Fix, EMS Heroes, Omni Developers and Rowan University, newest first, with the start/end months in the table above; and `grep -ric 'ethereum foundation' content/` returns 0.
- Every `hash` in `content/career-log.ts` matches `^[0-9a-f]{7}$`, all are unique, and no two share a two-character prefix; each equals `sha1(<org>:<startMonth>).slice(0,7)` for its entity, re-checked with `printf '%s' "Optimism:2025-05" | sha1sum | cut -c1-7`.
- `content/` contains no codepoint outside ASCII plus the sixteen GT-12 codepoints, verified with `node -e "const fs=require('fs');const ok=new Set([...'·—•–◆●→⏸☰⠿◉⏮⏭✉★▶']);for(const f of fs.readdirSync('content'))for(const c of fs.readFileSync('content/'+f,'utf8'))if(c.charCodeAt(0)>127&&!ok.has(c))throw new Error(f+': '+c);console.log('ok')"`.
- `content/boot.ts` exports exactly sixteen `BOOT_LINES` and `fill()` throws on an unresolved token, verified on Node 24 (type stripping is on by default, so a `.ts` file imports directly) with `node -e "import('./content/boot.ts').then(m=>{if(m.BOOT_LINES.length!==16)throw new Error('want 16');try{m.fill('{days}',{});throw new Error('did not throw')}catch(e){if(!/unresolved token/.test(e.message))throw e}console.log('ok')})"`.
- `npm run typecheck` is green and `npx prettier --check content/` reports no formatting drift.
- The diff touches only `content/resume.ts`, `content/manpage.ts`, `content/career-log.ts`, `content/identity.ts` and `content/boot.ts` — `git diff --name-only origin/main...HEAD` lists nothing else.

### At-merge gate

- `ci-ok` is green on the exact PR head, i.e. `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` passes on Node 24 in the KW-001 workflow.
- The CI build artifact contains no occurrence of `856-723-2521` and no occurrence of the personal address `kevinweaver2@gmail.com` unless GATE-005 (b) explicitly selected it.
- No change to `package.json` or `package-lock.json` (DEC-003 freezes both after KW-001).

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. GATE-005's six answers are recorded by the operator in `questions-or-commands.md` **before** pickup; they are a precondition for this ticket, not evidence it produces.

## Failure, security, migration, and accessibility cases

**Security and privacy — the dominant concern for this ticket.**

- **DEC-015.** `856-723-2521` never enters the repository or the build output. No obfuscation is acceptable: OCR and headless execution are standard in scraping pipelines, and each obfuscation also breaks the number for the one human who legitimately wanted it. The number is a probable account-recovery factor for someone who publicly works on crypto infrastructure; the downstream is SIM-swap targeting, not ordinary spam.
- **Email.** `kevinweaver2@gmail.com` is the operator's personal address and a likely recovery address for other accounts. It must not ship unless GATE-005 (b) says so explicitly. The resume's `notkevinweaver@gmail` has no TLD and is not a deliverable `mailto:`; appending `.com` is an inference, not a fact, and is exactly what GATE-005 (b) exists to settle.
- **Location.** `California, USA` stays coarse. Do not narrow to a locality anywhere in `content/`.
- **Private-repository disclosure.** Restricted contribution counts are publishable because they name nothing, but the copy labels the cluster `private repos` and **never** an employer (`content-ia` §11.5). No template in `content/boot.ts` may associate a private volume with an org name.

**Failure cases.**

- A payload field disappearing (KW-012 schema drift) must fail the build, not render `{contributions}` to a visitor. That is `fill()`'s throw.
- GATE-005 partially resolved: if any of the six answers is missing at pickup, stop and escalate rather than inventing a default. An invented job title or handle is a false claim about a real person and is not a repairable defect once published.
- The `side` lane being cut (GATE-005 (d)) changes `CAREER_LOG` from eight rows to seven and invalidates KW-017's "8 rows" acceptance. Flag it in the PR body so KW-017's acceptance is amended rather than silently failing.

**Accessibility.** No rendering here, but three data-shape decisions carry a11y weight and must not be simplified away:

- `IdentityLink.label` exists so the accessible name is **visible text**. The comp's four 34px tiles use `title=` only — invisible to touch users and unreliable for screen readers. Never remove `label` in favour of `title`.
- `LogHue` deliberately excludes `gray`: `#928374` on the pane surface `#1d2021` is 4.47:1 and fails AA for normal text. Every remaining hue clears 4.5:1.
- `CareerCommit.lane` and `.root` are semantic, so KW-017 can distinguish rows without relying on colour alone, and `ManBlock.term` / `ManSection.id` give KW-016 a real heading outline under KW-005's `sr-only h1` — the comp has zero headings.

**Migration.** None. `content/` is new at this commit and nothing reads it yet. `docs/design/kevinweaver.dev.dc.html` is a design record and is neither edited nor deleted here.

## Surfaces

- Reads: `docs/design/kevinweaver.dev.dc.html`, `docs/design/_ds/**`, `docs/research/2026-07-31-content-ia.md`, `docs/research/2026-07-31-design-comp-spec.md`, `docs/research/2026-07-31-decomposition-synthesis.md`, `tsconfig.json`, `package.json`
- Writes: `content/resume.ts`, `content/manpage.ts`, `content/career-log.ts`, `content/identity.ts`, `content/boot.ts`
- Contracts: `content` module exports — `Employer`/`EMPLOYERS`, `CareerCommit`/`CAREER_LOG`, `ManSection`/`MAN_PAGE`, `Identity`/`IDENTITY`, `BootLine`/`BOOT_LINES`/`BootToken`/`fill`
- Safety: personal-data redaction in `content/**` (phone number, personal email addresses, locality)

## Sibling boundaries and open gates

**Open gate blocking pickup: GATE-005.** Do not start until the operator has recorded all six answers — Twitter handle, shipping email, job title, whether the `side` lane appears, podcast name or cut, and the contact STATUS availability string. Each maps 1:1 onto a field named in "Refreshable implementation notes"; none of them is a judgement this ticket may make.

**Upstream.** KW-001 is the only hard dependency. It creates `tsconfig.json`, `package.json`, the npm scripts and the `ci-ok` workflow. If the base lacks `tsconfig.json`, KW-001 has not merged — stop, do not bootstrap the toolchain.

**Same-wave siblings whose write surfaces are off limits** (DEC-005 partitions wave 2 by file, which is what keeps ten tickets running in parallel): KW-003 owns `styles/**` and `app/globals.css`; KW-004 owns the icon set; KW-005 owns `app/layout.tsx`, `app/page.tsx`, `app/regions/_contract.ts` and all seven region stubs; KW-007 owns `lib/viz/tokens/**`; KW-008 owns `lib/viz/sim/**`; KW-009 and KW-010 own `scripts/pipeline/**`; KW-011 owns `vitest.config.mts` and `test/**`; KW-012 owns `lib/bundle/**`.

**Downstream consumers of this contract.** KW-016 renders `MAN_PAGE` and the `IDENTITY` `whoami`/`finger` block in `app/regions/ManPage.tsx`. KW-017 renders `CAREER_LOG` in `app/regions/CareerLog.tsx` and `components/ds/CommitLog.tsx`. KW-019 renders `IDENTITY.links` and `IDENTITY.status` in `app/regions/Contact.tsx`. KW-020 renders `BOOT_LINES` through `fill()` in `app/regions/BootOverlay.tsx`. KW-027 generates `/resume.txt`, `/kevinweaver.1`, the metadata export and the `<noscript>` fallback from the same modules. A rename of any exported symbol after merge breaks five tickets at once.

**Explicitly not a consumer.** KW-018 (header and tmux status bar) does not depend on this ticket and reads its figures directly from the payload. Do not add tmux segment copy to `content/`.
