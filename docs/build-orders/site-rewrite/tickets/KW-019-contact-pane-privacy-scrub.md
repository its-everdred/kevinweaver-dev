# KW-019 — Region: contact pane + privacy scrub

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 1 — One region file of presentational markup over an already-frozen data contract; no algorithm, no state machine, no new dependency. The only real judgement is the clipboard progressive-enhancement path, and the correct answer is written out below.

**Risk:** Medium despite complexity 1. This is the one surface on the site that publishes contact facts about a real person, so a wrong `href`, a leaked personal recovery address, or a phone number in the build output is a privacy defect on a public page rather than a cosmetic bug. Contained by GATE-005 resolving the unmeasurable facts before pickup, by hardcoding zero contact facts in the component, and by a grep-plus-rendered-HTML gate.

**Phase hint:** 3

**Depends on:** KW-003, KW-005, KW-006

**Serializes with:** none

**Requirements:** REQ-003, REQ-007, REQ-009

**Decisions:** DEC-002, DEC-004, DEC-005, DEC-015

**Gates:** GATE-005

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The `#contact` region renders the labelled REACH ME row — five identity links whose visible text is their accessible name, every one resolving to a live destination, every one carrying `rel="me"` — plus the STATUS block and the two `curl` lines; the email is a working `mailto:` anchor with a progressively-enhanced copy button layered on top; and the built output contains no phone number, no `tel:` URI, and no `title=`-only affordance.

## Context and evidence

The comp's contact pane is 9 lines of markup (`docs/design/kevinweaver.dev.dc.html:162-170`) and it is wrong in four separate ways. Re-measured this session against the file at `e664d73a195facd64db58ba10952170ff01b4772`:

| # | Defect | Evidence at the researched commit |
|---|---|---|
| 1 | Two dead anchors | `:167` and `:168` are both `href="#contact"` — the pane links to itself. Clicking the email or the Twitter tile does nothing. |
| 2 | Accessible name lives only in `title=` | All four tiles are `<a title="…">gh</a>` / `◆` / `✉` / `@`. The design track's a11y grep over the whole comp returns **0** matches for `aria-`, `role=`, `alt=` and `tabindex`. `title` is invisible to touch users and is not a reliable accessible name. |
| 3 | Two facts are wrong | `title="kevin@kevinweaver.dev"` and `title="@its_everdred"` (C-18, confirmed by the design track's own verifier: *"`title="kevin@kevinweaver.dev"` and `title="@its_everdred"` are both wrong and both `href="#contact"`"*). |
| 4 | LinkedIn is missing entirely | The comp has four tiles; the authoritative contact set is five. |

**C-18 (resolution: verifier wins).** The claim "100% of the comp's resume copy is placeholder" is false. The verifier's finding is explicit: *"§7.3 marks both GitHub tiles as correct and unchanged."* `https://github.com/its-everdred` and `https://github.com/its-applekid` are correct today — **do not churn them**. The accurate framing is "the two non-GitHub contact facts are wrong."

**DEC-015 (synthesis D-15) — the privacy half of this ticket.** The resume's phone number — the ten-digit NANP number recorded in `docs/research/2026-07-31-content-ia.md` §11.1, **deliberately not transcribed here** — must never enter the application code or the build output, and no obfuscation is acceptable. `content-ia` §11.1: it is a live personal number on a South Jersey area code attached to a resume that states California, i.e. almost certainly a legacy account-recovery factor for someone who publicly works on crypto infrastructure. The downstream is SIM-swap targeting, not ordinary spam. Image rendering, ROT13 and JS assembly all fail — OCR and headless execution are standard in scraping pipelines, and each obfuscation also breaks the number for the one human who legitimately wanted it. The audience is engineer peers; recruiters who need it get the PDF. KW-006 enforces this inside `content/`; **this ticket enforces it on the rendered surface**, because the contact pane is the only place on the site where a phone number would plausibly appear.

**Scoping correction, measured this session — read this before writing the grep.** The number is *already* committed to this repository, in three tracked research documents: `docs/research/2026-07-31-content-ia.md`, `docs/research/2026-07-31-design-comp-spec.md` and `docs/research/2026-07-31-decomposition-synthesis.md` (`git log --oneline -1 -- docs/research/2026-07-31-content-ia.md` → `6ef0209 Add rewrite research and decomposition`). A repo-wide `grep -rn '<number>' . --exclude-dir=node_modules --exclude-dir=.git` therefore **always matches** and can never be an achievable gate. Two consequences, both binding on this ticket:

1. DEC-015's operative surface for an executing agent is **application code plus build output** — `app/`, `components/`, `content/`, `lib/`, `public/`, `scripts/`, `styles/` and `.next/` — not `docs/`. The acceptance below is scoped accordingly, and it greps for the NANP *shape* rather than transcribing the number.
2. Purging the number from the research corpus is a repository-wide decision (it would mean rewriting committed planning evidence) and is out of scope for a complexity-1 region ticket. Record it in `deferred-findings.md` and escalate it to the operator, together with the related observation that these ticket documents are published verbatim as public GitHub issue bodies — which is why this document does not transcribe the number either.

**DEC-004 (synthesis D-04) — the glyph rule.** GT-12 measured exactly 16 distinct non-ASCII codepoints in the comp and zero in the PUA range. C-28 then tested each one against every `unicode-range` in the design system's `tokens/fonts.css` and found that the whole control set falls outside both `latin` and `latin-ext` — and outside every other subset in the file. Re-confirmed this session: the file is on disk with 12 `@font-face` blocks, and `grep -o 'U+2709\|U+25C9' docs/design/_ds/*/tokens/fonts.css` returns nothing. `✉` U+2709 — the comp's email tile at `:167` — is one of them. DEC-004's resolution is to replace the nine control glyphs `⏸ ⏮ ⏭ ▶ ✉ ☰ ⠿ ◉ ★` with inline SVG owned by KW-004, and to keep `· — • – → ◆ ●` as text, accepting the fallback stack for those. Both codepoints this region touches are named there: `✉` becomes `MailIcon`, `◉` becomes `CommitIcon`, `◆` stays as text. KW-004's own downstream table names this ticket: *"U+2709 ✉ → `mail` / `MailIcon` → `:167` contact tile → KW-019."*

**DEC-005 (synthesis D-05) — why this is one file.** Every same-wave ticket owns a disjoint write surface, because C-11 established that `serializes_with` is the one edge type aiur does *not* enforce at runtime. The synthesis's write-surface partition assigns `app/regions/<Region>.tsx` to one region ticket each; this ticket owns `app/regions/Contact.tsx` and nothing else. There is no cross-cutting a11y sweep ticket and no mobile sweep ticket — both were rejected because they would touch every region file and re-serialize the two widest waves. Each region therefore owns its own headings, focus states, reflow and colour-independence, and KW-029 verifies rather than sweeps.

**DEC-002 (synthesis D-02) — App Router and RSC.** The site is an App Router application with no `output:'export'`. This region is the one region in wave 3 that legitimately needs a browser API (`navigator.clipboard`), and the interaction between that need and the one-file write surface is resolved explicitly in "Contract and invariants" below.

**GATE-005 (HG-5).** Two of its six answers land on this pane: (a) Twitter `@kevin_weaver` (the authoritative resume) vs `its_everdred` (the measured, self-set GitHub `twitterUsername` field, C-13), and (b) which email ships — the resume's `notkevinweaver@gmail` has **no TLD** and is not a valid `mailto:`; `kevinweaver2@gmail.com` is the operator's personal address and a likely recovery address for other accounts, and must not be published without an explicit "yes"; `kevin@kevinweaver.dev` is the recommendation, and `kevinweaver.dev` already runs Namecheap email forwarding on five live MX records, so the alias is a registrar-panel row rather than a new service. Answer (f) supplies the STATUS availability string. **All three land in `content/identity.ts`, which KW-006 owns — this component hardcodes none of them.** The gate is declared here because this ticket is what publishes those facts to the web.

**`kevinmweaver.com` — do not link it.** `content-ia` §12.1 measured it dead; I re-measured this session and reproduced it exactly: `curl -sI -m 15 https://kevinmweaver.com` fails to connect (TLS timeout, `%{http_code}` = `000`) and `curl -sI -m 15 http://kevinmweaver.com` returns `302` to `https://y.at/ufo.laptop.coffee`, a Yat handle. `design-comp-spec` §7.3 proposes a sixth `www` tile pointing at it; **the synthesis overrides that** — it is not a website, and linking it sends a reader to a hard TLS timeout. It stays out until HG-5 resolves whether the domain gets redirected at the registrar.

**Live destination check, re-measured this session** (this is the ground truth the acceptance gate re-runs):

| URL | Result |
|---|---|
| `https://github.com/its-everdred` | `200` |
| `https://github.com/its-applekid` | `200` |
| `https://linkedin.com/in/kevinweaver` | `200` — but `https://www.linkedin.com/in/kevinweaver` returns **`999`**, LinkedIn's anti-bot status. `999` means "reachable, refusing the bot", not "broken". |
| `https://x.com/its_everdred` | `200`; `https://twitter.com/its_everdred` → `301` → `https://x.com/its_everdred` |
| `https://x.com/kevin_weaver` | `200`; `https://twitter.com/kevin_weaver` → `301` → `https://x.com/kevin_weaver` |
| `https://kevinmweaver.com` | connection failure — **excluded** |

**Requirements this ticket serves.** REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure), REQ-007 (no personal data reaches the repository or the build output), REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance, and the region renders accessible names as visible text).

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (pack-relative `../README.md`) — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Graph and wave analysis:** `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md` §5 "Ticket set", §6 "Wave diagram", "Verified topological levels", "Write-surface partition (proof of D-05)".
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (pack-relative `../03-technical-decisions.md`), sourced from the synthesis §3 decision table D-01…D-17 and §4 human gates HG-1…HG-7.
- **This ticket's upstream pointers:** the synthesis §5 entry **"KW-19 — Region: contact pane + privacy scrub"**, expanded below in "Refreshable implementation notes".
- **Copy source:** `docs/research/2026-07-31-content-ia.md` §7 "DELIVERABLE — `contact` pane", fenced block **lines 820–835**, plus §11.1–§11.3 (do-not-publish flags) and §12.1 (`kevinmweaver.com`). Comp corrections: `docs/research/2026-07-31-design-comp-spec.md` §7.3. In both files the appended `## Verification corrections` section **overrides the body of its own document**; that rule is already applied above for C-18 and for the `.com` inference on the email.

## Scope

- Replace the `app/regions/Contact.tsx` stub with the labelled REACH ME row: five identity links rendered from `IDENTITY.links`, each with its visible label text serving as its accessible name.
- Render every link's `rel` from `IdentityLink.rel`, normalized so `me` is always present and `noopener` is always present on external links.
- Ship the email as a `mailto:` anchor that works with JavaScript disabled, plus a copy-to-clipboard button that is rendered only after hydration and announces success through a polite live region.
- Render the right-hand row annotations from `IdentityLink.note`, never emitting the `◉` U+25C9 codepoint as text.
- Render the STATUS block from `IDENTITY.status` and the two closing `curl` lines from `IDENTITY.curlLines` as shell-transcript text, not as links.
- Emit zero `href="#contact"` values and zero `title=` attributes anywhere in the region's rendered output.
- Prove the render-side privacy scrub: no phone number, no `tel:` URI, no locality narrower than `IDENTITY.location`, and no personal recovery address in `.next/` or `public/` after a build.
- Meet the region's own accessibility floor: keyboard-reachable links and button, a non-colour link affordance, a `≥3:1` boundary on any bordered marker slot, and no fixed-width or `nowrap` declaration that could force horizontal scroll at 320 px.

## Non-goals

- Editing `content/identity.ts` or anything else under `content/`. KW-006 owns every contact fact; this component hardcodes none of them.
- Editing `app/page.tsx`, `app/layout.tsx` or `app/regions/_contract.ts`. KW-005 owns the shell, the region contract and the mounting order; KW-032 owns the final composition.
- Editing any other region file. KW-016 owns `ManPage.tsx`, KW-017 owns `CareerLog.tsx`, KW-018 owns `Header.tsx` and `TmuxBar.tsx`, KW-020 owns `BootOverlay.tsx`, KW-025 owns `Instrument.tsx`, KW-026 creates `TransportBar.tsx`.
- Adding a second file under `app/regions/`, `components/` or `styles/`. The write surface is exactly one file; a helper module belongs to a later ticket, not to a complexity-1 region job.
- Any CSS. KW-003 owns `app/globals.css`, `styles/ds/**` and `styles/kw.css`, including `.sr-only`, the `:focus-visible` ring and `body{overflow-x:clip}`.
- Authoring icon components or SVG path data. KW-004 owns `components/icons/**`; this ticket imports from it or degrades to text, and never duplicates it.
- Generating `/resume.txt` or `/kevinweaver.1`, the route handlers behind the two `curl` lines, page metadata, the OG image or the `<noscript>` fallback — all KW-027.
- Linking `https://kevinmweaver.com`. Measured dead this session; excluded until HG-5 resolves the registrar question.
- Publishing a phone number in any form, obfuscated or otherwise, or adding a `tel:` link or a Cal.com booking link. DEC-015; a synchronous channel is a product decision nobody has made.
- Any edit to `package.json` or `package-lock.json`. DEC-003 freezes both after KW-001; this ticket adds no dependency and needs none.
- Playwright specs, visual snapshots and axe runs. KW-023 owns the e2e scaffolding, KW-031 owns screenshots, KW-029 owns the accessibility gate.

## Existing owner and reuse target

`app/regions/Contact.tsx` does **not** exist at `e664d73a195facd64db58ba10952170ff01b4772` — verified with `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772`, whose non-`docs/` paths are the pre-rewrite Pages Router site (`pages/index.js`, `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `yarn.lock`, `tailwind.config.js`). **The file this ticket rewrites is created by KW-005**, which ships all seven region stubs plus the props contract.

Everything this ticket consumes is created by a named upstream ticket. Verify each at pickup by reading the file; if one is missing, its owning ticket has not merged — stop and report rather than creating it here.

| Reuse target | Path | Created by | What it gives this ticket |
|---|---|---|---|
| The stub being replaced | `app/regions/Contact.tsx` | KW-005 | the `Pane`-wrapped `<section id="contact">` skeleton and the export name |
| Region props + metadata | `app/regions/_contract.ts` | KW-005 | `ContactProps`, `REGION_META.contact` |
| Pane primitive | `components/ds/Pane.tsx` | KW-005 | `.pane` / `.pane-bar` / `.pane-body` markup, `titleAs="h2"`, `labelledBy` |
| Contact facts | `content/identity.ts` | KW-006 | `IDENTITY.links`, `.status`, `.curlLines`, `.email`, `.actors`, `.location` |
| Token surface + a11y primitives | `app/globals.css`, `styles/kw.css`, `styles/ds/**` | KW-003 | `--text-faint`, `--surface-pane`, `--bg4`, `--accent`, `.sr-only`, the `:focus-visible` ring, `body{overflow-x:clip}` |
| Control icons (soft) | `components/icons/index.ts`, `components/icons/paths.ts` | KW-004 | `MailIcon`, `CommitIcon` — **no dependency edge**; see the degradation rule below |

Targets that exist at the researched commit and are read-only inputs:

| Target | Path | What it gives this ticket |
|---|---|---|
| The comp | `docs/design/kevinweaver.dev.dc.html:162-170` | the markup being replaced, and the four defects enumerated above |
| Anchor affordance rule | `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/base.css:12-13` | `a{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in oklab,var(--accent) 45%,transparent);}` — the only non-colour link affordance in the system |
| Pane CSS | `…/layers/pane.css` | `.pane-body{flex:1 1 auto;min-height:0;padding:var(--pane-pad);overflow:hidden}` — a hard DS rule; this region must fit without scrolling |
| Type helpers | `…/layers/type.css` | `.dim{color:var(--text-faint)}`, `.prompt{color:var(--accent);font-weight:var(--fw-bold)}` |
| Gruvbox tokens | `…/tokens/colors.css:5-14,26` | the contrast facts in "Failure, security, migration, and accessibility cases" |
| Contact copy | `docs/research/2026-07-31-content-ia.md:820-835` | the row order, the STATUS block and the two `curl` lines |

**KW-004 degradation rule, quoted from KW-004's own sibling-boundaries section:** *"Only KW-018 and KW-026 declare a hard dependency on this ticket; the other five consume `components/icons/**` without one. They must **import**, never author, files under `components/icons/`… If this ticket has not merged when one of them starts, that ticket should leave the affordance as a plain-text placeholder and let KW-032's composition pass pick up the icon, rather than duplicating the module."* Applied here: `test -f components/icons/index.ts` at pickup. If it exists, import `MailIcon` and `CommitIcon`. If it does not, **omit the glyph entirely** — do not emit `✉` or `◉` as text, because C-28 measured that the shipped `latin` subset has no coverage for either and they would render as tofu — and leave the exact comment `{/* TODO(KW-004): MailIcon here once components/icons has merged. */}`.

## Contract and invariants

This ticket is a pure **consumer**. It produces one component export and no new interface. Three invariants govern it.

**Invariant 1 — zero contact facts in this file.** No email address, no handle, no profile URL, no availability string, and no `rel` token other than the two defensive normalizations below may appear as a literal in `app/regions/Contact.tsx`. Everything comes from `IDENTITY`. This is what makes GATE-005 a `content/` problem rather than a five-file problem, and it is checked in the agent gate by grep.

**Invariant 2 — one file, and therefore `'use client'` on that file.** The write surface is exactly `app/regions/Contact.tsx` (DEC-005 partition). `navigator.clipboard` requires a browser, `'use client'` is a module-level directive, and a client island needs its own module — so the directive goes at the top of this file. The consequences, stated so nobody "fixes" them later:

- The pane is still server-rendered to HTML. Every address, label and STATUS line is in the initial document, so the indexable-text property `content-ia` demanded is unaffected.
- `IDENTITY` is pure data and is bundled into the client chunk for this route. Measured shape: five links, a handful of strings — order of 1–2 KB before compression. `components/ds/Pane.tsx` joins the client graph for this route only; other regions keep their server-only Pane.
- This region has **no** "zero client JS" acceptance criterion. KW-016 and KW-017 do; do not copy their constraint here, and do not remove the copy affordance to satisfy a constraint this ticket was never given.
- Creating `app/regions/ContactCopy.tsx` to keep the pane a server component is **out of scope**. It is a write-surface extension, and an Executor-approved plan revision, not an agent decision.

**Invariant 3 — the accessible name is the visible text.** `content-ia` §7 requires *"Every tile keeps the accessible label as visible text, not a `title=`."* Since the label is visible text, **do not add `aria-label` to the links** — an `aria-label` that differs from visible text breaks WCAG 2.5.3 Label in Name, and one that matches it is redundant. `aria-label` appears exactly zero times in this file. The only icon-only control candidate is the copy button, and it is given visible text instead.

### Producer interface consumed — `content/identity.ts` (KW-006)

Quoted verbatim from KW-006. Do not paraphrase these into a local type; import them.

```ts
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

export interface Actor {
  readonly id: ActorId;                  // 'its-everdred' | 'its-applekid'
  readonly kind: 'human' | 'agent';
  readonly url: string;
  readonly since: string;
  /** Renderer picks the glyph/SVG (◉ human, ◆ agent). Never a glyph literal here. */
  readonly marker: 'human' | 'agent';
}

export interface Identity {
  readonly location: string;                   // 'California, USA' — never narrower
  readonly email: string;                      // GATE-005 (b)
  readonly actors: readonly Actor[];
  readonly links: readonly IdentityLink[];
  /** Contact STATUS block. GATE-005 (f). */
  readonly status: readonly string[];
  /** The two closing `curl` lines of the contact pane. */
  readonly curlLines: readonly string[];
  // …name, title, timezone, site, whoami, idLines, finger, project, plan…
}

export const IDENTITY: Identity;
```

**Worked data shape** — the value this component must render correctly. This is an illustrative fixture, not the shipping data; the real values land in `content/identity.ts` once GATE-005 answers (a), (b) and (f):

```ts
IDENTITY.links === [
  { id: 'github-human', label: 'github.com/its-everdred',  href: 'https://github.com/its-everdred',  rel: ['me', 'noopener'], external: true,  note: 'human' },
  { id: 'github-agent', label: 'github.com/its-applekid',  href: 'https://github.com/its-applekid',  rel: ['me', 'noopener'], external: true,  note: 'agent' },
  { id: 'email',        label: 'kevin@kevinweaver.dev',    href: 'mailto:kevin@kevinweaver.dev',     rel: ['me'],             external: false, note: 'click to copy' },
  { id: 'linkedin',     label: 'linkedin.com/in/kevinweaver', href: 'https://linkedin.com/in/kevinweaver', rel: ['me', 'noopener'], external: true, note: null },
  { id: 'twitter',      label: 'x.com/its_everdred',       href: 'https://x.com/its_everdred',       rel: ['me', 'noopener'], external: true,  note: null },
]
IDENTITY.email     === 'kevin@kevinweaver.dev'
IDENTITY.status    === ['Employed and interested. Remote, America/Los_Angeles.',
                        'Best subject line: something you are stuck on.']
IDENTITY.curlLines === ['curl -sL kevinweaver.dev/resume.txt',
                        'curl -sL kevinweaver.dev/kevinweaver.1 | man -l -']
```

**Cross-module invariants this component asserts rather than papers over.**

- The email row's `href` must be `` `mailto:${IDENTITY.email}` ``. The clipboard payload is `IDENTITY.email`, never a substring parsed out of `href`. If the two disagree at pickup, that is a KW-006 defect: say so in the PR body and open a follow-up; do not edit `content/`.
- `rel` is rendered from data, with two defensive normalizations only: `me` is added if absent, and `noopener` is added if `external === true` and it is absent. If either normalization fires, note it in the PR body so KW-006 can be corrected at source. Every other `rel` token passes through untouched.
- `note` renders verbatim as text with exactly one substitution: the codepoint `◉` U+25C9 is never emitted. Where `note` contains it, drop the codepoint and render `<CommitIcon size={11} />` in its place when `components/icons` exists.
- `IDENTITY.location` is rendered nowhere in this region. The coarse location belongs to the man page (`AUTHOR`) and the `finger` block, both KW-016. This region must not narrow it, restate it, or add a locality.

### Producer interface consumed — `app/regions/_contract.ts` (KW-005)

```ts
export interface RegionCommonProps {
  id?: string
  className?: string
  style?: CSSProperties
}
export interface ContactProps extends RegionCommonProps {}

export const REGION_META = {
  // …
  contact: {
    landmark: 'section',
    anchorId: 'contact',
    titleId: 'region-contact-title',
    accessibleName: 'reach me',
    headingLevel: 2,
  },
  // …
} as const satisfies Record<RegionSlot, RegionMeta>
```

`REGION_META.contact.anchorId` is the **only** source of the `#contact` fragment id. KW-018's header nav and KW-005's `NAV_SECTIONS` both target it; that nav link is the one legitimate `#contact` reference on the page and it lives in a different file. This region emits the id and zero `href="#…"` values.

### Producer interface consumed — `components/ds/Pane.tsx` (KW-005)

```ts
export interface PaneProps {
  title?: ReactNode
  titleId?: string
  titleAs?: 'span' | 'h2' | 'h3'
  right?: ReactNode
  as?: 'div' | 'section' | 'article' | 'aside'
  labelledBy?: string
  id?: string
  className?: string
  style?: CSSProperties
  bodyStyle?: CSSProperties
  bodyClassName?: string
  children?: ReactNode
  // …dots, titleColor, focus, bleed, footer, bodyRef…
}
export function Pane(props: PaneProps): ReactNode
```

`.pane-body{overflow:hidden}` is a hard DS rule. **Do not pass `bodyStyle={{ overflowY: 'auto' }}` here** — that override belongs to KW-016's pager and to no other region. This pane must fit its content at every width; if it does not, the fix is the row layout, not a scrollbar.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the pickup checks first; if one fails, stop and report — every one of them belongs to an upstream ticket.

### 1. Verify at pickup

```bash
test -f app/regions/Contact.tsx          # KW-005 — the stub this ticket replaces
test -f app/regions/_contract.ts         # KW-005 — ContactProps, REGION_META
test -f components/ds/Pane.tsx           # KW-005 — the Pane primitive
test -f content/identity.ts              # KW-006 — every contact fact
grep -n 'sr-only' styles/kw.css          # KW-003 — a11y primitives are present
grep -n '"@/\*"' tsconfig.json           # KW-001 — path alias; if absent use relative imports
test -f components/icons/index.ts        # KW-004 — SOFT: icons if present, text degradation if not
npm ci && npm run build                  # must be green BEFORE you change anything
```

`tsconfig.json` does not exist at `e664d73a195facd64db58ba10952170ff01b4772` — KW-001 creates it. As shipped by KW-001 and observed on `main`, it sets `"strict": true`, `"noUncheckedIndexedAccess": true`, `"jsx": "react-jsx"`, `"moduleResolution": "bundler"` and `"paths": { "@/*": ["./*"] }`. `noUncheckedIndexedAccess` matters here: an **array** index such as `IDENTITY.links[0]` or `IDENTITY.curlLines[1]` is `T | undefined` and must be narrowed rather than asserted with `!`. It does **not** affect `MARKER[link.id]`, because `Record<LinkId, string | null>` over a finite union has known keys — that lookup is exactly `string | null`, which is why the sketch consumes it as `marker ?? null`. The component iterates with `.map()` and never indexes an array positionally, so the constraint costs nothing.

Do **not** create `tsconfig.json`, `package.json`, `styles/kw.css`, `content/identity.ts` or anything under `components/`. If one is missing its owner has not merged.

### 2. The only file this ticket writes

```
app/regions/Contact.tsx        (modify — replaces KW-005's stub in place)
```

`git diff --name-only origin/main...HEAD` must list exactly that one path and nothing else.

### 3. Worked implementation

This is the shape to write. Names, structure and the degradation comments are load-bearing; formatting is whatever `npm run format` produces.

```tsx
'use client'

// app/regions/Contact.tsx — KW-019.
// Every contact fact comes from content/identity.ts (KW-006). Nothing here is a literal.

import { useCallback, useEffect, useState } from 'react'
import { Pane } from '@/components/ds/Pane'
import { IDENTITY, type IdentityLink, type LinkId } from '@/content/identity'
import { REGION_META, type ContactProps } from './_contract'
// If components/icons/index.ts exists (KW-004), add:
//   import { MailIcon, CommitIcon } from '@/components/icons'

const META = REGION_META.contact

/**
 * Left-hand marker slot, matching content-ia §7's `[gh] [◆] [✉] [in] [@]`.
 * `◆` U+25C6 stays as text per DEC-004. `✉` U+2709 is null here because C-28
 * measured no coverage in the shipped latin subset — it is <MailIcon/> or nothing.
 */
const MARKER: Record<LinkId, string | null> = {
  'github-human': 'gh',
  'github-agent': '◆',
  email: null,
  linkedin: 'in',
  twitter: '@',
}

/** DEC-015 + Invariant 1: this component owns no address, handle or URL. */
function relFor(link: IdentityLink): string {
  const rel = [...link.rel]
  if (!rel.includes('me')) rel.push('me')
  if (link.external && !rel.includes('noopener')) rel.push('noopener')
  return rel.join(' ')
}

/** `◉` U+25C9 is never emitted as text. Drop it; the icon carries it if present. */
function noteText(note: string | null): string | null {
  if (note === null) return null
  const stripped = note.replace('◉', '').trim()
  return stripped.length > 0 ? stripped : null
}

function CopyEmail({ address }: { address: string }) {
  // Rendered only after hydration, so the server HTML contains no inert control.
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    setMounted(true)
  }, [])

  const copy = useCallback(async () => {
    try {
      // navigator.clipboard is undefined outside a secure context (http:// on a
      // non-localhost host). Feature-detect; never assume it exists.
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(address)
      setState('copied')
    } catch {
      setState('failed')
    }
  }, [address])

  useEffect(() => {
    if (state === 'idle') return
    const t = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(t)
  }, [state])

  if (!mounted) return null
  return (
    <>
      <button type="button" onClick={copy} className="text-[var(--text-faint)]">
        copy
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Email address copied to clipboard.' : ''}
        {state === 'failed' ? 'Copy failed. Use the email link instead.' : ''}
      </span>
    </>
  )
}

export function Contact({
  id = META.anchorId ?? undefined,
  className,
  style,
}: ContactProps) {
  return (
    <Pane
      as="section"
      id={id}
      className={className}
      style={style}
      title={META.accessibleName}
      titleId={META.titleId}
      titleAs="h2"
      labelledBy={META.titleId}
    >
      <ul
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--sp-2)' }}
      >
        {IDENTITY.links.map((link) => {
          const marker = MARKER[link.id]
          const note = noteText(link.note)
          return (
            <li
              key={link.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--sp-3)',
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                className="text-[var(--text-faint)]"
                style={{ flex: '0 0 auto' }}
              >
                {/* MailIcon when KW-004 has merged; otherwise nothing. */}
                {marker ?? null}
              </span>
              {/* No `border` shorthand on an <a>: it deletes base.css's
                  a{border-bottom}, the only non-colour link affordance. */}
              <a href={link.href} rel={relFor(link)} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                {link.label}
              </a>
              {note ? <span className="text-[var(--text-faint)]">{note}</span> : null}
              {link.id === 'email' ? <CopyEmail address={IDENTITY.email} /> : null}
            </li>
          )
        })}
      </ul>

      <h3
        className="text-[var(--text-faint)]"
        style={{ textTransform: 'uppercase', letterSpacing: 'var(--ls-caps)', marginTop: 'var(--sp-4)' }}
      >
        status
      </h3>
      {IDENTITY.status.map((line) => (
        <p key={line} style={{ margin: 0 }}>
          {line}
        </p>
      ))}

      <pre style={{ margin: 'var(--sp-3) 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {IDENTITY.curlLines.map((line) => {
          const cmd = line.startsWith('$') ? line.slice(1).trim() : line
          return (
            <span key={line} style={{ display: 'block' }}>
              <span className="prompt" aria-hidden="true">
                ${' '}
              </span>
              {cmd}
            </span>
          )
        })}
      </pre>
    </Pane>
  )
}
```

Keep the export **named** and spelled exactly `Contact` — `app/page.tsx` imports `{ Contact } from './regions/Contact'` and KW-005's Invariant 1 forbids changing `app/page.tsx` to accommodate a region.

### 4. Rules that are easy to violate

1. **Never set the `border` shorthand on an `<a>` in this region.** `layers/base.css:12` gives every anchor `border-bottom:1px solid color-mix(in oklab,var(--accent) 45%,transparent)`. The comp's tiles set `border:2px solid var(--bg2)` inline, which silently deletes it — the same defect KW-018 has to repair on the header nav, where `border:none` removes the only non-colour link affordance on the site. If a bordered marker box is wanted, put the box on the wrapping `<span>`, and use `var(--bg4)`, never `var(--bg2)`: measured on the pane surface `#1d2021`, `--bg2 #504945` is **1.858:1** and fails WCAG 1.4.11's 3:1 for a component boundary, while `--bg4 #7c6f64` is **3.369:1** and clears it (C-17 — `--bg3 #665c54` measures 2.517 and also fails; do not reach for it).
2. **Never use `.gray` / `--text-comment` for text here.** `#928374` on `#1d2021` is **4.467:1** and fails AA for normal text. `.dim` / `--text-faint` `#a89984` is **5.898:1** and passes. Same rule KW-017 applies to log rows.
3. **Do not use the `.kicker` class for the STATUS heading.** `layers/type.css` gives `.kicker::before{content:"\25B8"}` — `▸` U+25B8 is not in GT-12's sixteen-codepoint budget and has no coverage in the shipped subset. Plain `<h3>` with token-driven inline style, as sketched.
4. **`aria-label` count in this file is zero.** Invariant 3. The copy button's accessible name is its visible text `copy`.
5. **No `width:` in pixels, no `white-space:nowrap`, no `min-width` above 0.** The tmux bar already overflows below ~470–515 px for exactly that reason (KW-018). `body{overflow-x:clip}` from KW-003 is a backstop, not a licence.
6. **No `target="_blank"`.** Nothing here should steal the tab. `noopener` is still emitted because `content-ia` §7 asks for it and it is free.
7. **`h3` is the deepest heading you may introduce.** KW-005 fixed one visually hidden `<h1>` on the page and `titleAs="h2"` for the pane title; regions own `h3` and below.
8. **No new dependency.** DEC-003 freezes `package.json` and `package-lock.json` after KW-001. `useState`/`useEffect`/`useCallback` come from `react@19.2.8`, already a dependency.

### 5. Exact version pins in play

None are added by this ticket. The ones it compiles against, all already present in `package.json` after KW-001: `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `eslint@9.39.5`, `eslint-config-next@16.2.12`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `prettier@3.9.6`. Node is pinned by `engines.node: "24.x"`.

## Acceptance and verification

### Agent gate

- `git diff --name-only origin/main...HEAD` lists exactly `app/regions/Contact.tsx` and nothing else.
- `npm run typecheck && npm run lint` is green and `npx prettier --check app/regions/Contact.tsx` reports no drift.
- Invariant 1 holds by grep: `grep -nE '@|https?://|mailto:|linkedin|twitter|x\.com|github\.com' app/regions/Contact.tsx` returns only the `@/…` module specifiers on the `import` lines and the `'@'` value in the `MARKER` table — no address, no handle, no profile URL, no `mailto:` literal.
- `grep -n 'aria-label' app/regions/Contact.tsx` returns nothing, and the only line matching `grep -n 'title=' app/regions/Contact.tsx` is the `<Pane … title={META.accessibleName}>` prop.
- Build and capture the rendered page: `npm run build && (npm run start &) && sleep 5 && curl -sS http://localhost:3000 -o /tmp/kw019.html`.
- The rendered contact region passes every structural assertion, run as one script: `node -e "const fs=require('fs');const h=fs.readFileSync('/tmp/kw019.html','utf8');const i=h.indexOf('id=\"contact\"');if(i<0)throw new Error('no #contact region');const s=h.slice(i,h.indexOf('</section>',i));const a=[...s.matchAll(/<a\b[^>]*>/g)].map(m=>m[0]);if(a.length!==5)throw new Error('want 5 links, got '+a.length);for(const t of a)if(!/rel=\"[^\"]*\bme\b/.test(t))throw new Error('missing rel=me: '+t);if(/\stitle=/.test(s))throw new Error('title= attribute present');if(/href=\"#/.test(s))throw new Error('dead in-page anchor');if(/<button/.test(s))throw new Error('copy control must not be in server HTML');if(/tel:/.test(s))throw new Error('tel: URI present');if(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(s))throw new Error('phone-shaped string present');console.log('ok')"`.
- Every external destination resolves: extract the four `https://` hrefs from `/tmp/kw019.html` and run `curl -sSIL -m 20 -A 'Mozilla/5.0' -o /dev/null -w '%{http_code} %{url_effective}\n'` on each. GitHub and X must return `200`; LinkedIn must return `200` **or** `999` (measured this session — `999` is LinkedIn's anti-bot status, not a broken link). Any `4xx`, `5xx` or `000` fails the gate.
- No occurrence of `kevinmweaver.com` anywhere in `app/regions/Contact.tsx` or in `/tmp/kw019.html`.
- No NANP-shaped string exists in the application code or the build output: `grep -rnE '\b[0-9]{3}[-.][0-9]{3}[-.][0-9]{4}\b' app components content lib public scripts styles .next 2>/dev/null` returns nothing. Do **not** widen this to the repository root — the number is already committed under `docs/research/**` (see "Context and evidence"), so a root-scoped grep can never pass.
- With JavaScript disabled the email is still actionable: `/tmp/kw019.html` (the server HTML, no hydration) contains an `<a href="mailto:…">` whose visible text is the address, and contains no `<button>` inside the contact region.
- After hydration the copy control works: load `http://localhost:3000` in a browser, click `copy`, and confirm the clipboard holds `IDENTITY.email` and that a polite status message is announced; then confirm the control disappears from the accessibility tree's clickable set only after the 2 s reset, not before.
- The region declares no fixed pixel width and no `white-space:nowrap`: `grep -nE "width: *'?[0-9]+px|nowrap" app/regions/Contact.tsx` returns nothing.
- `git diff origin/main...HEAD -- package.json package-lock.json` is empty.

### At-merge gate

- `ci-ok` is green on the exact PR head, i.e. `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` passes on Node 24 in the KW-001 workflow.
- The CI build artifact contains no NANP-shaped string, no `tel:` URI, and no occurrence of the operator's personal Gmail address (`content-ia` §11.2, second row) unless GATE-005 (b) explicitly selected it.
- The diff touches only `app/regions/Contact.tsx`; `package.json` and `package-lock.json` are unchanged (DEC-003).
- The PR body records any defensive normalization that fired (a missing `me` or `noopener` in `IdentityLink.rel`, or an email `href` that is not `mailto:${IDENTITY.email}`) as a KW-006 follow-up, and records whether `components/icons` was present at pickup so KW-032 knows whether the mail icon is still outstanding.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. GATE-005's answers (a) Twitter handle, (b) shipping email and (f) availability string are recorded by the operator in `questions-or-commands.md` **before** pickup and land in `content/identity.ts` via KW-006; they are a precondition for this ticket, not evidence it produces.

## Failure, security, migration, and accessibility cases

**Security and privacy — the dominant concern for this ticket.**

- **DEC-015, phone number.** The resume's phone number must not appear in the application code or the build output, in any form, and this document deliberately does not transcribe it. No obfuscation is acceptable: OCR and headless execution are standard in scraping pipelines, and every obfuscation also breaks the number for the one human who legitimately wanted it. `content-ia` §11.1's reasoning is specific — the number is on a South Jersey area code attached to a California resume, so it is almost certainly a legacy account-recovery factor, and the exposure for someone who publicly works on crypto infrastructure is SIM-swap targeting rather than ordinary spam. This region also adds no `tel:` link and no Cal.com booking link; a synchronous channel is a product decision nobody has made.
- **Personal recovery address.** `kevinweaver2@gmail.com` is the operator's personal address and a likely recovery address for other accounts. It must not ship unless GATE-005 (b) says so explicitly. Because this component renders `IDENTITY.email` rather than a literal, the guard belongs in the gate: the at-merge check greps the build artifact for it.
- **Email harvesting is an accepted, deliberate trade-off.** The address ships as plain text and as a `mailto:` href. DEC-015's rationale rejects obfuscation on exactly the grounds that would otherwise apply here, and `content-ia` §11.2 recommends a domain-scoped alias precisely because it is rotatable if it leaks. Do not add JS assembly, entity encoding or a `data-` attribute trick.
- **`rel="me"` is an identity attestation, not decoration.** Every URL it appears on is a claim that the linked profile is the same person. All five destinations are the operator's. Never put `rel="me"` on a third-party URL, and never add a sixth link without an operator decision.
- **`kevinmweaver.com`.** Re-measured this session: HTTPS fails to connect and HTTP `302`s to `https://y.at/ufo.laptop.coffee`. Linking it would send a reader to a hard TLS timeout and would attest identity to a URL the operator does not visibly control. Excluded until HG-5 resolves.
- **Location stays coarse.** `California, USA` is correct and deliberate; this region renders no location at all, and must not add one.
- **Clipboard.** `navigator.clipboard` is only defined in a secure context — it is `undefined` on `http://` for any host other than `localhost`, and the write can reject on a permissions policy. Both paths are caught, the state becomes `failed`, and the announcement points the user back at the `mailto:` link. The clipboard write is user-gesture-initiated and writes only `IDENTITY.email`; nothing else touches the clipboard.

**Failure cases.**

- **`components/icons` absent at pickup** (KW-004 has not merged; there is no dependency edge). Degrade to no glyph and the `TODO(KW-004)` comment. **Never** emit `✉` U+2709 or `◉` U+25C9 as text — C-28 measured no coverage in the shipped `latin` subset and they would render as tofu on any machine whose fallback stack lacks them.
- **`IdentityLink.rel` missing `me`.** The normalization adds it so a `content/` omission cannot ship a broken IndieWeb attestation, and the PR body records it so KW-006 is corrected at source. Do not edit `content/`.
- **Email `href` is not `mailto:${IDENTITY.email}`.** Stop and report as a KW-006 defect. Do not parse an address out of the href, and do not synthesize one — a wrong `mailto:` on a public page is a false claim about a real person.
- **`IDENTITY.status` empty or `IDENTITY.curlLines` empty** — GATE-005 (f) unanswered. Do not invent an availability string. Stop and escalate.
- **The two `curl` lines 404 until KW-027 merges.** `/resume.txt` and `/kevinweaver.1` are KW-027's, in wave 4. That is why they render as shell-transcript **text** and not as anchors: an anchor would be a dead link at this ticket's merge, which its own acceptance forbids. KW-027 and KW-032 verify that the two commands actually work.
- **JavaScript disabled or hydration fails.** The `mailto:` anchor is in the server HTML and works. The copy control simply never appears, which is why it is rendered after mount rather than server-rendered and left inert — an inert button is a WCAG 4.1.2 failure that a screen-reader user cannot detect.

**Accessibility.** This region owns its own subtree; DEC-005 rejected a cross-cutting a11y sweep, and KW-029 verifies rather than fixes.

- **1.1.1 / 4.1.2 Name, Role, Value.** Every link's accessible name is its visible label text. The copy control is a real `<button type="button">` with visible text. Marker glyphs are `aria-hidden="true"`. Zero `title=`, zero `aria-label` (Invariant 3, and WCAG 2.5.3 Label in Name).
- **4.1.3 Status Messages.** The copy confirmation is a `role="status" aria-live="polite"` region inside `.sr-only`, so it is announced without moving focus.
- **1.4.3 Contrast (Minimum).** Text uses `--text-faint #a89984` at **5.898:1** on the pane surface `#1d2021`, or the default body colour. `--text-comment #928374` at **4.467:1** is forbidden. Under the scanline (`rgba(0,0,0,.16)` at `opacity:.35`, `mix-blend-mode:multiply`, an effective 0.944 multiplier on one of every three pixel rows) 5.898 degrades to ~5.57 and still clears AA, so this region is independent of GATE-007.
- **1.4.11 Non-text Contrast.** Any bordered marker slot uses `--bg4 #7c6f64` at **3.369:1**, not `--bg2 #504945` at **1.858:1** and not `--bg3 #665c54` at **2.517:1** (C-17). The focus ring is KW-003's global `2px solid var(--fg0)` at 14.451:1 on this surface; this region adds none of its own.
- **1.4.1 Use of Color.** Link affordance is the `border-bottom` from `layers/base.css:12` plus the underlined-address text — never colour alone. Setting a `border` shorthand on an `<a>` deletes it; that is rule 1 in the implementation notes.
- **1.4.10 Reflow.** No fixed pixel width, no `nowrap`, `overflowWrap: 'anywhere'` on the long address tokens, and the row wraps rather than clipping. The longest token is `github.com/its-everdred` at 23 characters, roughly 161 px at 11 px JetBrains Mono, so a 320 px viewport has headroom once the annotation wraps. KW-029 re-verifies 1.4.10 across all regions.
- **2.1.1 / 2.4.7 Keyboard and Focus Visible.** Five links and one button, all natively focusable in document order; no `tabindex`, no keyboard trap, no custom key handling. The focus ring comes from KW-003.
- **Heading outline.** `titleAs="h2"` for the pane title under KW-005's visually hidden `<h1>`, and one `<h3>` for STATUS. No second `<h1>`, no skipped level.

**Migration.** None. `app/regions/Contact.tsx` is a stub created by KW-005 in the previous wave and nothing consumes this region's internals. `docs/design/kevinweaver.dev.dc.html` is a design record; it is neither edited nor deleted.

## Surfaces

- Reads: `docs/design/kevinweaver.dev.dc.html`, `docs/design/_ds/**`, `docs/research/2026-07-31-content-ia.md`, `docs/research/2026-07-31-design-comp-spec.md`, `docs/research/2026-07-31-decomposition-synthesis.md`, `content/identity.ts`, `app/regions/_contract.ts`, `components/ds/Pane.tsx`, `components/icons/index.ts`, `styles/kw.css`, `app/globals.css`, `tsconfig.json`, `package.json`
- Writes: `app/regions/Contact.tsx`
- Contracts: `app/regions/Contact.tsx` named export `Contact(props: ContactProps)` mounted by `app/page.tsx`
- Safety: rendered contact-pane privacy scrub (phone number, `tel:` URI, personal recovery address, locality), identity-link `rel="me"` attestation set

## Sibling boundaries and open gates

**Open gate blocking pickup: GATE-005 (HG-5).** Three of its six answers surface on this pane — (a) Twitter `@kevin_weaver` vs `its_everdred`, (b) which email ships, and (f) the STATUS availability string. All three land in `content/identity.ts`, which KW-006 owns; this component hardcodes none of them and therefore needs no rework when they change. The gate is declared here because this is the ticket that publishes them to the web. Do not invent a default for any of the three — an invented handle or address is a false claim about a real person and is not a repairable defect once published.

**Upstream, and what to do while each is unmerged.**

- **KW-005** creates `app/regions/Contact.tsx`, `app/regions/_contract.ts` and `components/ds/Pane.tsx`. Consumed symbols: `ContactProps`, `REGION_META.contact`, `Pane`. If the stub is absent, KW-005 has not merged — stop; do not scaffold the region contract here, because eight tickets build against that seam and a second definition would fork it.
- **KW-006** creates `content/identity.ts`. Consumed symbols: `IDENTITY.links`, `IDENTITY.email`, `IDENTITY.status`, `IDENTITY.curlLines`, and the types `IdentityLink` / `LinkId`. If absent, KW-006 has not merged — stop; do not inline a placeholder link array, because that is exactly the literal-contact-fact failure Invariant 1 exists to prevent.
- **KW-003** creates `app/globals.css`, `styles/kw.css` and `styles/ds/**`. Consumed names: `--text-faint`, `--surface-pane`, `--bg4`, `--accent`, `--sp-*`, `--ls-caps`, `.sr-only`, `.prompt`, the `:focus-visible` ring, `body{overflow-x:clip}`. If `.sr-only` does not resolve, the live-region announcement renders visibly — that is a KW-003 gap, not something to patch with an inline style here (KW-005 Invariant 5: regions never write CSS).
- **KW-004** (soft, no edge) creates `components/icons/**`. Consumed symbols: `MailIcon`, `CommitIcon`. Degradation rule is in "Existing owner and reuse target" — import if present, omit the glyph if not, never author an icon file.

**Same-wave siblings whose write surfaces are off limits.** Wave 3 runs eleven tickets in parallel on disjoint files: KW-013 and KW-014 own `scripts/pipeline/**`; KW-015 owns `lib/bundle/loader.ts`; **KW-016** owns `app/regions/ManPage.tsx`; **KW-017** owns `app/regions/CareerLog.tsx` and `components/ds/CommitLog.tsx`; **KW-018** owns `app/regions/Header.tsx`, `app/regions/TmuxBar.tsx` and `components/ds/TmuxBar.tsx`; **KW-020** owns `app/regions/BootOverlay.tsx`; KW-021 owns `lib/viz/sim/{step,layout}.ts`; KW-022 owns `lib/viz/render/**`; KW-023 owns `playwright.config.ts`, `e2e/**` and `.github/workflows/e2e.yml`. Touching any of them turns eleven parallel tickets into a merge-conflict queue.

Two boundaries that look shared but are not:

- **The `#contact` fragment.** KW-018's header nav renders `href="#contact"` from `NAV_SECTIONS`; that anchor is correct and lives in `Header.tsx`. This region emits the `id` and zero in-page hrefs. Do not "fix" the nav from here.
- **The `◆ agent` disclosure.** `content-ia` §11.4 keeps the agent-account disclosure loud on purpose, and it appears in three places: this pane's `github-agent` row, the man page `BUGS` section (KW-016) and the log tail (KW-025). Each renders it from `IDENTITY.actors[].marker`; none of them owns the fact.

**Downstream.** KW-029 (accessibility gate) re-verifies this region's 1.4.10, 1.4.11 and 4.1.2 claims with axe and a real browser, and depends on this ticket. KW-032 (capstone) composes the final page, depends on this ticket, and picks up the mail icon if KW-004 landed after it. KW-027 makes `/resume.txt` and `/kevinweaver.1` real, which is what turns the two `curl` lines from a joke into a working command.

**Gates that do not block this ticket.** GATE-002 (HG-2, `workflow` scope) touches only tickets that write `.github/workflows/**`. GATE-003 (HG-3, SSO PAT) touches only the grid/private-aggregate data path. GATE-007 (HG-7, scanline treatment) is absorbed: every contrast pair in this region clears AA at `--scanline-opacity:.35`, so either resolution is safe.
