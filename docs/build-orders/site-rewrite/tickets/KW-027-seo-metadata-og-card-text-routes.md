# KW-027 — SEO metadata, OG card, /resume.txt, /kevinweaver.1, and the no-JavaScript fallback

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Five files, no new dependency and no algorithm; the work is transcription of a document head plus two text serialisers over data another ticket owns. What keeps it off complexity 1 is that three of the five artifacts are new public URLs whose failure modes are silent — a social card that errors renders as no card at all, on every platform, with no error anywhere — so the fallback path has to be built and proved, not assumed.

**Risk:** medium — this ticket decides what a link to kevinweaver.dev looks like everywhere it is ever pasted, and it publishes the first machine-readable copy of the operator's resume. Every failure is quiet: a missing card, a stale claim, a personal phone number in a plain-text route that scrapers read before a human ever does. Contained by a five-file write surface with a one-commit revert, by a build-time-only render path with no runtime error surface, and by grep-based privacy assertions over the built output.

**Phase hint:** 4

**Depends on:** KW-005, KW-006, KW-016, KW-017

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-008, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005, DEC-008, DEC-011, DEC-015

**Gates:** GATE-005

**Workstream:** content

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

A link to kevinweaver.dev pasted into Slack, iMessage, Discord, X or LinkedIn unfurls as a 1200×630 gruvbox terminal card with a real title and description; `curl -sL kevinweaver.dev/resume.txt` prints the whole resume as 80-column plain text; `curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` renders it as a real manual page; and the served HTML carries `lang`, a canonical URL, a description, a favicon link and a complete OpenGraph/Twitter block where today it carries `<title>Hi.</title>` and nothing else.

## Context and evidence

### What the site serves today

Measured live this session, against the production deployment that has been unchanged since 2021-05-31:

```
$ curl -s https://www.kevinweaver.dev/ | grep -o '<title>[^<]*</title>\|<meta[^>]*>\|<html[^>]*>'
<html>
<meta name="viewport" content="width=device-width"/>
<meta charSet="utf-8"/>
<title>Hi.</title>
<meta name="next-head-count" content="4"/>
```

Four head tags. No `lang` attribute on `<html>`. No description. No OpenGraph, no Twitter card, no canonical, no favicon `<link>`. `public/favicon.ico` is committed and served, but nothing points at it. That is the entire indexable and shareable surface of the site today, and it is why this ticket exists.

```
$ curl -sI https://www.kevinweaver.dev/resume.txt | head -1
HTTP/2 404
```

### Why the text routes are load-bearing, not decorative

`content-ia` §4 states the man page ships in **three** places: rendered into the `#whoami` pager (KW-016), served verbatim as plain text at `/resume.txt`, and served as real roff at `/kevinweaver.1` so `curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` works. KW-006 already encodes both `curl` invocations as data — `IDENTITY.curlLines` is `$ curl -sL kevinweaver.dev/resume.txt` and `$ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -`, rendered in the contact pane by KW-019. **Those two strings are currently a promise the site does not keep.** This ticket makes them true. KW-016's own document says the same thing about its abridged-pane hint.

The apex→www redirect preserves the path, so the promised commands work as written:

```
$ curl -sI https://kevinweaver.dev/resume.txt | grep -i '^HTTP\|^location'
HTTP/2 308
location: https://www.kevinweaver.dev/resume.txt
```

`curl -sL` follows it. Do not "fix" `IDENTITY.curlLines` to say `www.` — the apex form is correct and measured.

### DEC-011 and the `<noscript>` contradiction, resolved

The synthesis's KW-27 entry says "the `<noscript>` block carries the man page and git log (D-11)". Two later, more specific findings override the literal reading:

- **DEC-011** as recorded is about the *canvas*: "Canvas for the interactive grid + a visually-hidden `<table>` as text alternative, `<noscript>` fallback and SEO surface." The table is the fallback, and `components/viz/ContributionTable.tsx` is **KW-029's** write surface. It is visually hidden, not `noscript`-gated, so it is in the DOM and indexable unconditionally.
- **DEC-002** made the resume panes React Server Components. KW-016 and KW-017 both ship **zero client JavaScript** — their acceptance criteria say so explicitly and assert it against the built HTML. The man page and the eight-row career log are therefore already in the served HTML with scripting disabled. A `<noscript>` copy of them would be a second copy.
- KW-017 states the consequence in its own words: *"Do not attempt to solve this by rendering the rows twice; duplicate career text would poison both the accessibility tree and KW-027's SEO surface."*

**Resolution (binding for this ticket):** the `<noscript>` block is a short pointer, not a duplicate. It names the two text URLs and says the animated instrument needs scripting. `content-ia` §10.4's original wording ("a `<noscript>` block containing the §5.2 log and the §4 man page") was written under the assumption that the page would be a canvas with zero indexable text; DEC-002 retired that assumption. The `<link rel="alternate" type="text/plain" href="/resume.txt">` half of §10.4 **does** ship, through `metadata.alternates.types`.

### DEC-008 on a social card

D-08: *"No contribution figure is a literal anywhere in copy. Every number reads from the payload."* This binds the OG card, which `content-ia` §10.4 designs with a tmux strip reading `◉ 8,515 ◆ 1,486` and `☰ 2038/2038`. Both figures are **wrong** — C-3 re-measured the split as `11,848 / 1,512` against the public profile calendar after finding every authenticated measurement ~25% low (C-1: the local token has no SAML grant for `ethereum-optimism`, and GitHub's authenticated search returns an empty set rather than an error). The card therefore reads its numbers from `public/data/v1/manifest.json` and `public/data/v1/grid.json`, or omits them entirely. It never carries a literal.

The same correction kills `content-ia` §10.4's proposed `og:image:alt`, which hardcodes "five years" — a window length, which DEC-008 also forbids — and a January 2026 agent date. The agent's start is a fact `content/identity.ts` already carries as `Actor.since`, so the alt string is composed from it.

### DEC-003 and the dependency that is not needed

`content-ia` §10.4's implementation constraint names `@vercel/og`. D-03 freezes `package.json` and `package-lock.json` after KW-001, and KW-001's installed set does not contain `@vercel/og`. **It does not need to.** Measured in this repository's `node_modules` at the pinned `next@16.2.12`:

```
$ cat node_modules/next/og.js
module.exports = require('./dist/server/og/image-response')

$ grep -o '"version":"[^"]*"' node_modules/next/dist/compiled/@vercel/og/package.json
"version":"0.11.1"
```

`next/og` re-exports a compiled `@vercel/og@0.11.1`, wasm binaries and all (`resvg.wasm` 1.4 MB, `yoga.wasm` 72 KB, both vendored). `import { ImageResponse } from 'next/og'` therefore satisfies the whole ticket with **zero** dependency changes, which is what DEC-003 requires.

### DEC-004, and why the design-system font cannot be used on the card

`content-ia` §10.4 says JetBrains Mono must be supplied to satori as an `ArrayBuffer`. Two measured facts block that here:

1. KW-004 ships **WOFF2** (`public/fonts/**`, latin-only, one roman + one italic entry). The bundled satori's font parser recognises `wOFF` and has no `wOF2` magic anywhere in it:
   ```
   $ grep -o 'wOF2\|wOFF' node_modules/next/dist/compiled/@vercel/og/index.node.js | sort | uniq -c
         1 wOFF
   ```
   WOFF2 is not a format this renderer can load.
2. KW-004 is **not** a dependency of this ticket (deps are KW-005, KW-006, KW-016, KW-017), so its output may not be assumed present.

The card therefore renders with `ImageResponse`'s bundled default typeface and passes no `fonts` option. This is a deliberate, recorded deviation from `content-ia` §10.4, and it is why the card's design leans on the ribbon, the pane border and the colour field rather than on typographic character. DEC-004's *other* half still binds: **no control glyphs on the card**. `◉ ◆ ☰ ⠿` are not guaranteed by the default face, and KW-004's SVG icon components are not available here, so the card uses the words `human` and `agent`.

### GATE-005 (HG-5) blocks pickup

Six facts about Kevin that no measurement can settle gate KW-006 and transitively this ticket: the Twitter handle (`@kevin_weaver` on the authoritative resume vs the measured, self-set GitHub `twitterUsername` `its_everdred`, C-13), which email ships (the resume's `notkevinweaver@gmail` has **no TLD** and is not a valid `mailto:`), the job title, whether the `side` lane appears, the podcast, and the availability string. Three of them reach this ticket directly: `twitter:site`/`twitter:creator` (a), the `mailto:` that appears in `/resume.txt` (b), and the title that appears in `<title>`, `og:title` and on the card (c). **All three are read out of `content/identity.ts`, never written here**, so the gate resolves in exactly one file and this ticket needs no rework when it does.

### Requirements this ticket serves

- **REQ-002** — the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions. This ticket adds the App Router's other two route kinds: the metadata file convention and two Route Handlers.
- **REQ-003** — every claim on the site is the authoritative resume or measured data; no placeholder copy, no invented employer, no hardcoded figure. `<title>Hi.</title>` is the last placeholder on the site, and this ticket deletes it.
- **REQ-008** — the site has real indexable text; `content/` is the single source `/resume.txt`, `/kevinweaver.1` and the `<noscript>` fallback generate from.
- **REQ-009** — the page carries a correct heading outline, landmark structure and keyboard affordances, and the resume surfaces render with zero client JavaScript. This ticket's three routes render with zero JavaScript of any kind, client or server, at request time.

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (pack-relative `../README.md`) — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Graph and wave analysis:** `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md` §5 "Ticket set" (wave 4), §6 "Wave diagram", "Verified topological levels", "Critical path", "Write-surface partition (proof of D-05)".
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (pack-relative `../03-technical-decisions.md`), sourced from the synthesis §3 decision table D-01…D-17 and §4 human gates HG-1…HG-7.
- **This ticket's upstream pointers:** the synthesis §5 entry **"KW-27 — SEO, metadata, OG image, /resume.txt, noscript fallback"**, expanded below in "Refreshable implementation notes".
- **Copy and constraint sources (verified present at the researched commit):** `docs/research/2026-07-31-content-ia.md` §4 (man page), §4.1 (abridged), §5.2 (git log), §6 (whoami), §7 (contact), §10 (title, meta, cards, OG image), §11 (do-not-publish flags); `docs/research/2026-07-31-nextjs-upgrade.md` §3.4 (route plan), §3.3 + VC-4 (why not `output: 'export'`); `docs/research/2026-07-31-vercel-platform.md` C7. In every research file the appended `# Verification corrections` section **overrides the body of its own document**.

## Scope

- Expand `app/layout.tsx`'s `metadata` export into a complete document head: title, a 150-character description, canonical URL, a `text/plain` alternate pointing at `/resume.txt`, an explicit favicon link, an OpenGraph `profile` block, Twitter card fields sourced from `content/identity.ts`, and an explicit `robots` directive.
- Add `app/opengraph-image.tsx`: a 1200×630 build-time social card rendered with `next/og`'s `ImageResponse`, carrying the identity block, a gruvbox pane frame and — when the activity payload is present — the real contribution ribbon.
- Make the card fail safe: any render error, and any absent or malformed payload file, degrades to committed bytes rather than to an error, with the degraded path exercised by an explicit switch.
- Commit `public/og.png`, the byte-snapshot of the payload-free card, as the mandatory static fallback.
- Add `app/resume.txt/route.ts`: the man page, the eight-row career log and the identity block rendered as 80-column plain text generated from `content/`, served as `text/plain; charset=utf-8`.
- Add `app/kevinweaver.1/route.ts`: the same man page emitted as real roff `man(7)` source, served as `text/troff; charset=utf-8`, so `curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` renders.
- Add one `<noscript>` element to `app/layout.tsx` that names the two text URLs and the scripting requirement of the instrument pane, and duplicates no career or man-page text.
- Prove, over the built output, that the phone number `<redacted-personal-phone>` appears in none of the three new routes and in no metadata value.

## Non-goals

- The final composition of `app/page.tsx`. KW-032 owns it.
- The visually hidden contribution `<table>`, the canvas `role="img"` and its `aria-label`. DEC-011's text alternative is KW-025's and KW-029's; `components/viz/ContributionTable.tsx` is KW-029's write surface.
- Any region component. `app/regions/**` belongs to KW-005 (stubs and `_contract.ts`), KW-016, KW-017, KW-018, KW-019, KW-020, KW-025 and KW-026.
- Authoring copy. Every string this ticket serves comes out of `content/**`, which is KW-006's exclusive write surface. The only new strings written here are the `<title>`, the meta description, the OpenGraph `siteName`/`locale`, and the `<noscript>` sentence — all four are document-head chrome, not resume claims.
- Adding a dependency. `@vercel/og`, `satori`, `sharp`, `resvg`, `@fontsource/*`: none of them. DEC-003 freezes `package.json` and `package-lock.json` after KW-001, and `next/og` already vendors the renderer.
- `robots.txt`, `sitemap.xml`, JSON-LD / schema.org, `manifest.webmanifest`, analytics and verification meta tags. None are in the plan; adding them expands the write surface and the review surface for no measured benefit on a single-page site.
- Self-hosting fonts or emitting icons. KW-004 owns `public/fonts/**`, `app/fonts.ts` and `components/icons/**`, and its WOFF2 output is unusable by this renderer regardless.
- The data pipeline. `public/data/v1/**` is produced by KW-012, KW-013 and KW-014; this ticket only reads it, optionally, and must build green when it is absent.
- `next.config.ts`, `vercel.json`, `tsconfig.json`, `package.json`, `.github/workflows/**`. All KW-001's. In particular, do **not** add `outputFileTracingIncludes` — the routes here are statically generated and need no runtime file tracing.
- Swapping the font loader in `app/layout.tsx`. That one-line change belongs to KW-004 under its own coordination item; leave whatever loader and `className` are on `<html>` untouched.

## Existing owner and reuse target

None of the five write-surface files exist at `e664d73a195facd64db58ba10952170ff01b4772` except `public/`, and the whole `app/` directory is absent. Verified:

```
$ git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772 | grep -v '^docs/'
.aiur/config …  .eslintrc.js  .gitignore  README.md
components/HomeHero.js  components/Timeline.js  components/WriteCode.js
package-lock.json  package.json
pages/_app.js  pages/api/hello.js  pages/index.js  postcss.config.js
public/favicon.ico  public/images/…  public/vercel.svg
styles/globals.scss  tailwind.config.js  yarn.lock
```

The reuse targets are therefore upstream tickets plus two artifacts that genuinely exist today:

| Target | Owner | What this ticket takes from it |
|---|---|---|
| `app/layout.tsx` — the `metadata` and `viewport` exports | created by **KW-001**, JSX tree rewritten by **KW-005** | the object this ticket expands. KW-001 lands `metadataBase`, `title`, `description`; KW-005 explicitly reserves the metadata export for this ticket ("KW-027 later expands the metadata export"). **Extend it; do not replace the file.** |
| `content/manpage.ts` — `MAN_PAGE`, `MAN_HEADER`, `MAN_FOOTER`, `MAN_WRAP_COLUMNS`, `MAN_ABRIDGED_HINT` | **KW-006** | the twelve roff sections, the running header/footer triples, the 78-column wrap constant |
| `content/career-log.ts` — `CAREER_LOG`, `CAREER_LOG_PANE_TITLE`, `CAREER_LOG_HEAD` | **KW-006** | the eight commit rows, their bodies, hashes, refs and lanes |
| `content/identity.ts` — `IDENTITY` | **KW-006** | name, title, location, timezone, email, actors, links, `whoami`, `idLines`, `finger`, `project`, `plan`, `status`, `curlLines` |
| `content/boot.ts` — `fill` | **KW-006** | the `{token}` substitution used to resolve `MAN_FOOTER.center`'s `{date}`. Nothing else from this module. |
| `content/resume.ts` — `EMPLOYERS` | **KW-006** | only the stack line on the OG card, and only if `IDENTITY` does not already carry an equivalent |
| `public/favicon.ico` | **exists at the researched commit** (2021 tree, verified above) | the target of the new `icons` metadata entry. Do **not** move it to `app/favicon.ico`; that is outside the write surface and would change the served URL. |
| `next/og` from `next@16.2.12` | **KW-001** installs the pin | `ImageResponse`. Verified present in the installed tree as a re-export of a compiled `@vercel/og@0.11.1`. |
| `public/data/v1/manifest.json`, `public/data/v1/grid.json` | **KW-014** (not a dependency) | optional card data. Must be treated as absent. |
| `lib/viz/tokens/ramp.ts` | **KW-007** (not a dependency) | the DEC-009 ten-stop ramp, mirrored — not imported — see "Contract and invariants". |

**Verify at pickup, and stop rather than fix:** `test -f app/layout.tsx && test -d app/regions && test -f content/manpage.ts && test -f app/regions/ManPage.tsx && test -f app/regions/CareerLog.tsx`. If any is missing, an upstream ticket has not merged; report and stop. Do not bootstrap another ticket's file.

## Contract and invariants

This ticket is a **consumer** of KW-006's `content/**` contract and a **producer** of three public URL contracts plus the document head. It exports no TypeScript symbol that another ticket imports; its seams are HTTP responses and HTML tags.

### Consumed contract — quoted verbatim from KW-006

The shapes below are copied byte-for-byte from KW-006's interface sketch. Do not re-derive them, and do not widen them locally:

```ts
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
export const MAN_ABRIDGED_HINT: string;

// ── content/career-log.ts ────────────────────────────────────────────────────
export interface CareerCommit {
  readonly hash: string;        // 7 lowercase hex chars
  readonly ref: string | null;
  readonly years: string;       // '2025–26', en dash U+2013
  readonly title: string;
  readonly detail: string;
  readonly stack: readonly string[];
  readonly hue: LogHue;
  readonly lane: 'main' | 'role' | 'side' | 'education';
  readonly root: boolean;
  readonly body: readonly string[];
  readonly preWeb3: boolean;
}
export const CAREER_LOG: readonly CareerCommit[];        // newest first, exactly eight
export const CAREER_LOG_PANE_TITLE: string;              // 'git log --graph --decorate --all'
export const CAREER_LOG_HEAD: string;                    // 'HEAD -> optimism'

// ── content/identity.ts ──────────────────────────────────────────────────────
export interface IdentityLink {
  readonly id: 'github-human' | 'github-agent' | 'email' | 'linkedin' | 'twitter';
  readonly label: string;
  readonly href: string;
  readonly rel: readonly string[];
  readonly external: boolean;
  readonly note: string | null;
}
export interface Actor {
  readonly id: 'its-everdred' | 'its-applekid';
  readonly kind: 'human' | 'agent';
  readonly url: string;
  readonly since: string;       // ISO date, 'YYYY-MM-DD'
  readonly marker: 'human' | 'agent';
}
export const IDENTITY: Identity;   // name, title, location, timezone, site, email,
                                   // actors, links, whoami, idLines, finger,
                                   // project, plan, status, curlLines

// ── content/boot.ts ──────────────────────────────────────────────────────────
export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>,
): string;                        // throws on an unresolved token
```

**`fill()` throws on an unresolved token, by contract.** Do not wrap it in `try`/`catch` in either route. A `content/manpage.ts` that introduces a second token must fail the build, not ship a literal `{date}` to a `curl`.

### Produced contract 1 — `GET /resume.txt`

```
HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8
```

Body, in this order, with a single blank line between blocks and a trailing newline:

```
KEVINWEAVER(1)                General Commands Manual              KEVINWEAVER(1)

NAME
       kevinweaver - lead fullstack software engineer; turns ambiguous problems
       into shipped, documented, onchain-adjacent systems

SYNOPSIS
       …every ManSection in MAN_PAGE order, every ManBlock at its own indent…

KEVINWEAVER(1)                      2026-07-31                    KEVINWEAVER(1)

$ git log --graph --decorate --all

* commit ee787a7 (HEAD -> optimism, origin/optimism)
| Author: Kevin Weaver <…>
| Date:   2025-05 .. present
|
|     <CareerCommit.title>
|     <CareerCommit.detail>
|
|     <CareerCommit.body[0]>
|     …
…eight rows, newest first, root row last with no trailing rail…

$ whoami
its-everdred

$ finger -l
…IDENTITY.finger / .project / .plan…

REACH ME
…IDENTITY.links, one per line: label, href, note…

STATUS
…IDENTITY.status…

$ curl -sL kevinweaver.dev/resume.txt
$ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -
```

Invariants:

1. **Every byte comes from `content/**`.** The only literals this route may contain are the fixed-width layout scaffolding (spaces, `*`, `|`, `$`), the section labels `REACH ME` and `STATUS`, and the shell prompts that `IDENTITY` already carries. No employer, date, title, hash, link or number is written here.
2. **Ordering equals the panes.** `MAN_PAGE` order and `CAREER_LOG` order, unmodified. `CAREER_LOG` is newest-first with exactly eight entries; render all eight, including the four `preWeb3` rows that KW-017 folds behind `<details>` on small screens. A text file has no viewport.
3. **`abridged` is ignored.** The abridged section set exists for the sub-1080px pane (KW-016). `/resume.txt` is the full page, always.
4. **Header and footer are padded to exactly 80 columns** — `left` flush left, `center` centred, `right` flush right — from `MAN_HEADER` and `MAN_FOOTER`, with `MAN_FOOTER.center`'s `{date}` resolved through `fill()`.
5. **No line exceeds 82 columns.** That is the measured widest line in the source copy (`content-ia` §4's `SYNOPSIS` at indent 7, re-measured this session at 82), and it is the same ceiling KW-016 renders to.
6. **Privacy (DEC-015).** The string `<redacted-personal-phone>` must not appear. Neither must any `tel:` URI. The email that appears is exactly `IDENTITY.email` — whatever GATE-005 (b) settles on — and nothing else.
7. **Static.** `export const dynamic = 'force-static'`. The route is prerendered at build; it reads no header, no cookie and no search parameter.

### Produced contract 2 — `GET /kevinweaver.1`

```
HTTP/1.1 200 OK
content-type: text/troff; charset=utf-8
```

Real roff source using `man(7)` macros. The first line is the `.TH` title macro, whose five arguments map onto KW-006's header/footer triples:

```roff
.TH KEVINWEAVER 1 "<fill(MAN_FOOTER.center, { date })>" "<MAN_FOOTER.left>" "<MAN_HEADER.center>"
```

`.TH title section date source manual` — `date` renders bottom-centre, `source` bottom-left, `manual` top-centre. That reproduces `content-ia` §4's rendering exactly. Verified end to end on this machine with `man 2.13.1`:

```
$ printf '.TH KEVINWEAVER 1 "2026-07-31" "kevinweaver.dev" "General Commands Manual"\n.SH NAME\nkevinweaver \\- lead fullstack software engineer\n.SH SYNOPSIS\n.B kevinweaver\n[\\fB\\-v\\fR...] PROBLEM...\n.SH DESCRIPTION\nTest paragraph.\n.TP\n\\fB\\-j\\fR \\fIJOBS\\fR\nRun up to JOBS problems in parallel.\n' | man -l -
KEVINWEAVER(1)              General Commands Manual              KEVINWEAVER(1)

NAME
     kevinweaver - lead fullstack software engineer

SYNOPSIS
     kevinweaver [-v...] PROBLEM...

DESCRIPTION
     Test paragraph.

     -j JOBS
            Run up to JOBS problems in parallel.

kevinweaver.dev                    2026-07-31                    KEVINWEAVER(1)
```

Macro mapping, one rule per `ManBlock`:

| Input | Emitted roff |
|---|---|
| `ManSection` | `.SH <id>` — `SEE ALSO` and `REPORTING BUGS` contain a space, so quote the argument: `.SH "SEE ALSO"` |
| `block.term === null && !block.literal` | `.PP` then the block's lines, one per output line, unindented — let roff fill them |
| `block.term !== null` | `.TP` then the escaped term on its own line, then the block's lines |
| `block.literal === true` | `.nf` then the lines verbatim, then `.fi` |

Escaping rules — get these wrong and the page renders as garbage or drops lines:

```ts
/** Backslash is roff's escape character; `\e` is the literal backslash. */
function roffText(text: string): string {
  return text.replace(/\\/g, '\\e')
}

/**
 * A line whose first character is `.` or `'` is a roff control line and would be
 * silently swallowed. `\&` is the zero-width character that demotes it to text.
 */
function roffLine(text: string): string {
  const escaped = roffText(text)
  return /^[.']/.test(escaped) ? `\\&${escaped}` : escaped
}

/** Option terms want a real minus, not a hyphenation-eligible hyphen. */
function roffTerm(term: string): string {
  return roffText(term).replace(/(^|\s)-/g, '$1\\-')
}
```

Invariants: same content source and same privacy rule as `/resume.txt`; `export const dynamic = 'force-static'`; **no blank input lines** (in `man` macros a blank line is a `.sp`, which double-spaces the whole page — use `.PP` between paragraphs and emit no empty lines).

### Produced contract 3 — `GET /opengraph-image` and the head it generates

`app/opengraph-image.tsx` is a Next metadata file convention, not a hand-written route. Verified against `next@16.2.12` by building a scratch tree containing only the three new files: the route table reported

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /kevinweaver.1
├ ○ /opengraph-image
└ ○ /resume.txt
○  (Static)  prerendered as static content
```

and the emitted asset was `PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced`. **All four routes prerender at build time.** There is no runtime error surface: a card that would 500 is a red build instead, which is the loud failure `content-ia` §10.4 asks for.

The convention also writes the head. Measured from the built `index.html` of that same scratch tree, with **no** `openGraph.images` or `twitter` keys in the metadata export:

```html
<meta property="og:image" content="https://www.kevinweaver.dev/opengraph-image?40bee19ac84064ef"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="test card"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="https://www.kevinweaver.dev/opengraph-image?40bee19ac84064ef"/>
<meta name="twitter:image:alt" content="test card"/>
<meta name="twitter:image:type" content="image/png"/>
<meta name="twitter:image:width" content="1200"/>
<meta name="twitter:image:height" content="630"/>
```

**Therefore: do not write `openGraph.images`, `twitter.card`, `twitter.images` or `twitter.imageAlt` in `metadata`.** The `size`, `contentType` and `alt` exports of `app/opengraph-image.tsx` are the single source for all eleven tags, and `twitter:card` is already `summary_large_image`. Duplicating them emits two `og:image` values and platforms pick unpredictably. `og:title` and `og:description` were likewise emitted automatically from `metadata.title` and `metadata.description`; override them only where `content-ia` §10.3 wants different text.

### The fallback ladder, stated precisely

Three tiers, in order:

1. **Full card** — `public/data/v1/manifest.json` and `public/data/v1/grid.json` both parse: identity block, contribution ribbon coloured by the DEC-009 ramp, tmux strip with payload-derived counts.
2. **Payload-free card** — either file is absent or malformed: identical card with an empty `#3c3836` lattice and **no** counts in the tmux strip. This is the tier that renders before KW-014 has merged, and it is the tier whose bytes become `public/og.png`.
3. **Committed bytes** — `ImageResponse` itself throws (a wasm or renderer failure): the route returns the bytes of `public/og.png` with `content-type: image/png`.

Tier 3 is reachable on demand so it can be proved: `process.env.KW_OG_FALLBACK === '1'` forces it.

### The DEC-009 ramp is mirrored, not imported

The ten-stop ramp `#3c3836 #404a2b #4d5b21 #5e6a1f #70791d #83881b #98971a #b8bb26 #d9d34a #faeb77` is DEC-009's decision text and `lib/viz/tokens/ramp.ts` is its in-app home — but KW-007 is **not** a dependency of this ticket, so importing it would be an undeclared edge. Declare the ten hexes locally in `app/opengraph-image.tsx` with a comment naming `lib/viz/tokens/ramp.ts` as the source of truth, and add the at-merge check below that asserts the two lists are identical. The same reasoning applies to the gruvbox hexes: `ImageResponse` renders outside the browser cascade and cannot resolve a CSS custom property, so `--bg-h` etc. must be inlined as literals. Their source of truth is `styles/ds/tokens/colors.css` (KW-003), itself vendored from `docs/design/_ds/…/tokens/colors.css`, which reads:

```css
--bg-h:#1d2021; --bg0:#282828; --bg1:#3c3836; --bg2:#504945;
--bg3:#665c54; --bg4:#7c6f64; --gray:#928374;
--fg0:#fbf1c7; --fg1:#ebdbb2; --fg2:#d5c4a1; --fg3:#bdae93; --fg4:#a89984;
--purple:#d3869b; --aqua:#8ec07c; --green:#b8bb26;
```

Band thresholds are **not** mirrored: `grid.json` carries `bands` (KW-007's log2 lower bounds) in the payload precisely so nothing downstream hardcodes them.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read every cited file at pickup; if a line number has moved, the named symbol still governs. The toolchain measurements below were taken against the pinned set KW-001 installs (`next@16.2.12`, `react@19.2.8`, `typescript@5.9.3`, `eslint@9.39.5` — C-15/VC-3: ESLint **9**, not 10; TypeScript **5.9.3**, not `latest`), with `strict` and `noUncheckedIndexedAccess` on and the `"@/*": ["./*"]` path alias present. Confirm the alias exists before using `@/content/...`; if it does not, use relative imports and do not edit `tsconfig.json`.

### Files, exactly five

```
app/layout.tsx              MODIFY — metadata export + one <noscript>
app/opengraph-image.tsx     CREATE
app/resume.txt/route.ts     CREATE   (a directory literally named `resume.txt`)
app/kevinweaver.1/route.ts  CREATE   (a directory literally named `kevinweaver.1`)
public/og.png               CREATE   (binary, ~24 KB, generated then committed)
```

Both dotted directory names are legal App Router segments and are **not** intercepted as metadata routes — `next/dist/lib/metadata/is-metadata-route.js` only claims `robots`, `manifest`, `sitemap`, `icon`, `apple-icon`, `opengraph-image`, `twitter-image` and `favicon`. Proved by the scratch build above, which emitted `.next/server/app/resume.txt.body` and `.next/server/app/kevinweaver.1.body` with the exact `content-type` headers each route set.

### 1. `app/layout.tsx` — surgical edit

Keep every existing import, the font-loader statement, the `viewport` export, the `<html>` `className` and the entire JSX tree that KW-005 left. Change two things: replace the `metadata` object, and add one `<noscript>` as the first child of `<body>`.

```tsx
import type { Metadata } from 'next'
import { IDENTITY } from '@/content/identity'
// …KW-001's and KW-005's existing imports stay exactly as they are…

const TWITTER = IDENTITY.links.find((link) => link.id === 'twitter') ?? null
/** '@handle' from the profile URL, or undefined when GATE-005 (a) cut the handle. */
const TWITTER_HANDLE = TWITTER
  ? `@${new URL(TWITTER.href).pathname.replace(/^\/+/, '')}`
  : undefined

export const metadata: Metadata = {
  metadataBase: new URL('https://www.kevinweaver.dev'),
  title: 'Kevin Weaver — Lead Fullstack Software Engineer',
  description:
    'Kevin Weaver, lead fullstack software engineer. Web3 builder, Ethereum enthusiast, public goods enjoyer. Sixteen years of commits, replayed backwards.',
  applicationName: IDENTITY.site,
  authors: [{ name: IDENTITY.name, url: `https://${IDENTITY.site}` }],
  creator: IDENTITY.name,
  publisher: IDENTITY.name,
  alternates: {
    canonical: '/',
    types: {
      'text/plain': [{ url: '/resume.txt', title: 'resume.txt' }],
      'text/troff': [{ url: '/kevinweaver.1', title: 'kevinweaver(1)' }],
    },
  },
  icons: { icon: '/favicon.ico' },
  openGraph: {
    type: 'profile',
    siteName: IDENTITY.site,
    url: '/',
    locale: 'en_US',
    firstName: 'Kevin',
    lastName: 'Weaver',
    username: IDENTITY.whoami,
    description:
      "Sixteen years of commits, replayed backwards. Web3 builder, Ethereum enthusiast, public goods enjoyer, building coordination tools on the internet's frontier.",
    // NO `images` key. app/opengraph-image.tsx owns og:image and all four of its
    // sub-properties, plus the whole twitter:image block. Measured, not assumed.
  },
  twitter: {
    // NO `card` and NO `images` keys — both are emitted by the file convention.
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    description: 'Sixteen years of commits, replayed backwards. Two committers: one human, one agent.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}
```

Measured string lengths, so the reviewer does not have to count: `title` **47** chars, `description` **150** chars (inside Google's ~155–160 truncation), `openGraph.description` **158**, `twitter.description` **83**. All four are `content-ia` §10.1–§10.3 verbatim. `metadataBase` matters: without it, `alternates.canonical: '/'` and `openGraph.url: '/'` cannot be made absolute and Next warns at build.

`OpenGraphProfile` and `AlternateURLs` are exactly these shapes in `next@16.2.12` — verified in `node_modules/next/dist/lib/metadata/types/opengraph-types.d.ts:41-47` and `.../alternative-urls-types.d.ts`. `robots.googleBot['max-image-preview']` is typed at `metadata-types.d.ts:53`.

The `<noscript>`:

```tsx
<noscript>
  <p className="kw-noscript">
    The contribution instrument needs JavaScript. Everything else on this page is
    already here. The same resume is served as plain text at{' '}
    <a href="/resume.txt">/resume.txt</a> and as a manual page at{' '}
    <a href="/kevinweaver.1">/kevinweaver.1</a>.
  </p>
</noscript>
```

It carries no career text and no man-page text — see the DEC-011 resolution above. `kw-noscript` needs no rule to exist; if KW-003 has not defined one the paragraph inherits body type, which is fine. Do not add CSS: `app/globals.css` and `styles/**` are KW-003's exclusive write surface.

**The one head tag that is not this ticket's:** `<html lang="en">` is KW-005's, and KW-005's acceptance already asserts it. Verify it is present; if it is not, that is a KW-005 regression to report, not to patch here.

### 2. `app/resume.txt/route.ts`

```ts
import { CAREER_LOG, CAREER_LOG_PANE_TITLE } from '@/content/career-log'
import { fill } from '@/content/boot'
import { IDENTITY } from '@/content/identity'
import { MAN_FOOTER, MAN_HEADER, MAN_PAGE } from '@/content/manpage'

export const dynamic = 'force-static'

const COLUMNS = 80
const REVISION_DATE = new Date().toISOString().slice(0, 10)

/** Left flush, centre centred, right flush right, padded to exactly COLUMNS. */
function chrome(triple: { left: string; center: string; right: string }, center: string): string {
  const slack = COLUMNS - triple.left.length - center.length - triple.right.length
  const leftPad = Math.max(1, Math.floor(slack / 2))
  const rightPad = Math.max(1, slack - leftPad)
  return triple.left + ' '.repeat(leftPad) + center + ' '.repeat(rightPad) + triple.right
}

function manPageLines(): string[] {
  const out: string[] = [chrome(MAN_HEADER, MAN_HEADER.center), '']
  for (const section of MAN_PAGE) {
    out.push(section.id, ...section.blocks.flatMap(blockLines), '')
  }
  out.push(chrome(MAN_FOOTER, fill(MAN_FOOTER.center, { date: REVISION_DATE })))
  return out
}

function blockLines(block: (typeof MAN_PAGE)[number]['blocks'][number]): string[] {
  const pad = ' '.repeat(block.indent)
  const body = block.lines.map((line) => (line === '' ? '' : pad + line))
  return block.term === null ? [...body, ''] : [' '.repeat(7) + block.term, ...body, '']
}

function careerLogLines(): string[] {
  const out: string[] = [`$ ${CAREER_LOG_PANE_TITLE}`, '']
  for (const commit of CAREER_LOG) {
    const decoration = commit.ref === null ? '' : ` (${commit.ref})`
    out.push(`* commit ${commit.hash}${decoration}`)
    const rail = commit.root ? ' ' : '|'
    out.push(`${rail} Date:   ${commit.years}`, rail)
    out.push(`${rail}     ${commit.title}`, `${rail}     ${commit.detail}`, rail)
    for (const line of commit.body) out.push(`${rail}     ${line}`)
    if (commit.stack.length > 0) out.push(rail, `${rail}     ${commit.stack.join(' · ')}`)
    out.push(commit.root ? '' : rail)
  }
  return out
}

export function GET(): Response {
  const body = [
    ...manPageLines(),
    '',
    ...careerLogLines(),
    '',
    `$ whoami`,
    IDENTITY.whoami,
    '',
    `$ finger -l`,
    ...IDENTITY.finger.map((field) => `${field.label}: ${field.value}`),
    '',
    ...IDENTITY.project,
    ...IDENTITY.plan,
    '',
    'REACH ME',
    ...IDENTITY.links.map((link) =>
      link.note === null ? `  ${link.label}  ${link.href}` : `  ${link.label}  ${link.href}  (${link.note})`,
    ),
    '',
    'STATUS',
    ...IDENTITY.status.map((line) => `  ${line}`),
    '',
    ...IDENTITY.curlLines,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
```

`CAREER_LOG_HEAD` (`'HEAD -> optimism'`) is deliberately **not** imported above. KW-006 also carries that decoration inside the newest row's `ref` field, and printing both would duplicate it. Read `content/career-log.ts` at pickup: if `CAREER_LOG[0].ref` already contains the HEAD decoration, leave the sketch as written; if it does not, import `CAREER_LOG_HEAD` and prepend it to that one row's parenthesised decoration. Never print it twice.

Note the deliberate omission of an `Author:` line. `content-ia` §5.2 writes `Kevin Weaver <kevin@kevinweaver.dev>`, which is GATE-005 (b) — if that address ships it will be in `IDENTITY.email`, and the line can be added from `IDENTITY.name` + `IDENTITY.email`. Never hardcode it.

### 3. `app/kevinweaver.1/route.ts`

```ts
import { fill } from '@/content/boot'
import { MAN_FOOTER, MAN_HEADER, MAN_PAGE } from '@/content/manpage'

export const dynamic = 'force-static'

const REVISION_DATE = new Date().toISOString().slice(0, 10)

const roffText = (text: string): string => text.replace(/\\/g, '\\e')
const roffLine = (text: string): string => {
  const escaped = roffText(text)
  return /^[.']/.test(escaped) ? `\\&${escaped}` : escaped
}
const roffTerm = (term: string): string => roffText(term).replace(/(^|\s)-/g, '$1\\-')
const quoted = (value: string): string => `"${value.replace(/"/g, '\\(dq')}"`

export function GET(): Response {
  const date = fill(MAN_FOOTER.center, { date: REVISION_DATE })
  const out: string[] = [
    `.TH KEVINWEAVER 1 ${quoted(date)} ${quoted(MAN_FOOTER.left)} ${quoted(MAN_HEADER.center)}`,
  ]

  for (const section of MAN_PAGE) {
    out.push(`.SH ${quoted(section.id)}`)
    for (const block of section.blocks) {
      if (block.term !== null) {
        out.push('.TP', roffTerm(block.term))
      } else {
        out.push('.PP')
      }
      if (block.literal) out.push('.nf')
      for (const line of block.lines) {
        // A roff blank line is a .sp and double-spaces the page. Drop them.
        if (line.trim() !== '') out.push(roffLine(line))
      }
      if (block.literal) out.push('.fi')
    }
  }

  return new Response(out.join('\n') + '\n', {
    headers: { 'content-type': 'text/troff; charset=utf-8' },
  })
}
```

Two details that will bite if skipped: `.SH` arguments containing a space (`SEE ALSO`, `REPORTING BUGS`) must be quoted or roff reads only the first word; and `block.lines` are pre-wrapped at 78 columns for the pane, but roff re-fills them, so the rendered width follows the reader's terminal. That is correct man behaviour — do not add `.ll`.

### 4. `app/opengraph-image.tsx`

```tsx
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { IDENTITY } from '@/content/identity'

// Runtime is Node on purpose. Do NOT `export const runtime = 'edge'` — this module
// reads the payload off disk at build time, and edge has no `node:fs`.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const AGENT = IDENTITY.actors.find((actor) => actor.kind === 'agent') ?? null
export const alt = AGENT
  ? `A gruvbox terminal card showing Kevin Weaver's GitHub contribution ribbon, with a purple sub-band from ${AGENT.since} where a second committer account starts writing to the same repositories.`
  : "A gruvbox terminal card showing Kevin Weaver's GitHub contribution ribbon."

/** DEC-009. Source of truth is lib/viz/tokens/ramp.ts (KW-007); mirrored here
 *  because KW-007 is not a dependency of KW-027. Kept in sync by an at-merge check. */
const RAMP = [
  '#3c3836', '#404a2b', '#4d5b21', '#5e6a1f', '#70791d',
  '#83881b', '#98971a', '#b8bb26', '#d9d34a', '#faeb77',
] as const

const C = {
  bgHard: '#1d2021', bg1: '#3c3836', bg2: '#504945',
  fg0: '#fbf1c7', fg3: '#bdae93', fg4: '#a89984',
  aqua: '#8ec07c', purple: '#d3869b',
} as const

type Card = {
  readonly cells: readonly number[]   // 371 band levels, oldest → newest; -1 == no data
  readonly agent: readonly boolean[]  // 371 flags, agent activity on that day
  readonly totals: string | null      // e.g. 'human 11,848 · agent 1,512'; null when unknown
  readonly window: string | null      // e.g. '2021-01-01 → 2026-07-31'
}

async function loadCard(): Promise<Card> {
  if (process.env.KW_OG_FALLBACK === '1') throw new Error('forced fallback')
  const dir = join(process.cwd(), 'public', 'data', 'v1')
  const [manifest, grid] = await Promise.all([
    readFile(join(dir, 'manifest.json'), 'utf8').then(JSON.parse),
    readFile(join(dir, 'grid.json'), 'utf8').then(JSON.parse),
  ])
  // …slice the trailing 371 daily buckets out of grid.e / grid.a, bucket each
  //   through grid.bands, and format the two actor totals from the same arrays…
}

export default async function Image(): Promise<Response> {
  try {
    let card: Card
    try {
      card = await loadCard()
    } catch {
      card = { cells: Array(371).fill(-1), agent: Array(371).fill(false), totals: null, window: null }
    }
    return new ImageResponse(<OgCard card={card} />, size)
  } catch {
    const png = await readFile(join(process.cwd(), 'public', 'og.png'))
    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png' },
    })
  }
}
```

Layout of `<OgCard>`, from `content-ia` §10.4 with the DEC-008 corrections applied:

- Canvas `1200×630`, `background: #1d2021`, a 1 px `#504945` pane border inset 24 px.
- Top left, 68 px, `#fbf1c7`: `kevin weaver` (lowercase, as the comp sets it).
- Under it, 26 px, `#bdae93`: `IDENTITY.title` — GATE-005 (c), read, never written.
- Under that, 20 px, `#a89984`: the stack line, joined with ` · ` from the current role's `stack` in `EMPLOYERS[0]`.
- Centre band: 53 columns × 7 rows, cell 15 px, gap 4 px → `1003 × 129`, centred. `cells[i] === -1` renders `#3c3836`; otherwise `RAMP[level]`. A cell with `agent[i]` gets a 3 px `#d3869b` bar along its bottom edge.
- Bottom edge, 44 px full bleed, `#3c3836`: `kw` in `#8ec07c`, then `git:main`, `kevinweaver.dev`, spacer, then `card.totals` and `card.window` **only when non-null**. Powerline separators are plain SVG polygons; there are no glyphs anywhere on the card (DEC-004).

Element budget: 371 cells + up to 371 sub-bars + ~20 chrome nodes stays under 800 flat nodes, which `content-ia` §10.4 measured as inside satori's budget. Keep every node a `<div>` with an explicit `style`; satori has no canvas and no cascade. Every flex parent needs an explicit `display: 'flex'` — satori throws on a multi-child element without one.

### 5. Producing `public/og.png` — order matters

The `catch` branch reads `public/og.png`, so on the very first build that file does not exist. That is safe: the catch branch is only reached when `ImageResponse` throws, which it does not. Generate the artifact from the route itself, in this order, and commit both in the same change:

```bash
npm run build                      # green; catch branch never taken
npm run start &                    # next start on :3000
curl -s http://localhost:3000/opengraph-image -o public/og.png
node -e "const b=require('fs').readFileSync('public/og.png');console.log(b.readUInt32BE(16),b.readUInt32BE(20))"
# → 1200 630
kill %1
```

`public/og.png` is not covered by `.gitignore` (verified: the file ignores `/.next/`, `/out/`, `/build`, `.env*` and `node_modules`, nothing under `public/`). Expect roughly 24 KB — the scratch card measured 24 KB at 1200×630 RGBA. If it lands above 150 KB the card is over-detailed; simplify rather than compressing with a new tool.

### What to do while a dependency is unmerged

- **KW-006 unmerged** — nothing here can be written. Every string comes from `content/**`. Stop and report.
- **KW-016 / KW-017 unmerged** — the routes can technically be written from `content/**` alone, but the dependency exists so that the served text and the rendered panes are known to agree. Do not start; the ordering is the point.
- **KW-004 unmerged, or merged** — irrelevant either way. The card passes no `fonts` option.
- **KW-007 unmerged** — irrelevant. `RAMP` is mirrored locally; the at-merge sync check simply has no counterpart file to compare against and is skipped.
- **KW-012 / KW-013 / KW-014 unmerged** — expected. `public/data/v1/**` is absent, `loadCard()` throws `ENOENT`, tier 2 renders, and the committed `public/og.png` is that tier's bytes. When the pipeline later lands, the card gains its ribbon at the next build with no code change.

## Acceptance and verification

### Agent gate

- `npm run typecheck` exits zero with `app/opengraph-image.tsx`, `app/resume.txt/route.ts` and `app/kevinweaver.1/route.ts` in the program.
- `npm run lint` exits zero.
- `npm run build` exits zero and its route table lists `/opengraph-image`, `/resume.txt` and `/kevinweaver.1`, each marked `○ (Static)`.
- With `npm run start` serving the production build on port 3000: `curl -sI http://localhost:3000/resume.txt` returns `200` and `content-type: text/plain; charset=utf-8`, and `curl -sI http://localhost:3000/kevinweaver.1` returns `200` and `content-type: text/troff; charset=utf-8`.
- `curl -s http://localhost:3000/kevinweaver.1 | man -l - | head -1` prints a line containing `KEVINWEAVER(1)` and the manual name, and `curl -s http://localhost:3000/kevinweaver.1 | man -l - | grep -c '^[A-Z]'` shows all twelve section headings.
- `curl -s http://localhost:3000/resume.txt | grep -oE 'NAME|SYNOPSIS|DESCRIPTION|OPTIONS|ENVIRONMENT|FILES|EXAMPLES|DIAGNOSTICS|SEE ALSO|AUTHOR|REPORTING BUGS|BUGS' | sort -u | wc -l` returns `12`.
- Every one of the eight `CAREER_LOG` hashes appears in `/resume.txt`: `node -e "const {CAREER_LOG}=require('./content/career-log');process.stdout.write(CAREER_LOG.map(c=>c.hash).join('\n'))" | while read h; do curl -s http://localhost:3000/resume.txt | grep -q "$h" || exit 1; done` exits zero.
- No line of `/resume.txt` exceeds 82 columns: `curl -s http://localhost:3000/resume.txt | awk 'length > 82 { bad++ } END { exit bad > 0 }'` exits zero.
- `curl -s http://localhost:3000/opengraph-image -o /tmp/og.png` then `node -e "const b=require('fs').readFileSync('/tmp/og.png');if(b.readUInt32BE(16)!==1200||b.readUInt32BE(20)!==630)process.exit(1)"` exits zero.
- The tier-3 fallback is real: `KW_OG_FALLBACK=1 npm run build && npm run start`, then `curl -s http://localhost:3000/opengraph-image | cmp - public/og.png` exits zero.
- The served head is complete: `curl -s http://localhost:3000/ > /tmp/home.html`, then each of `grep -c '<html lang="en"'`, `grep -c 'rel="canonical"'`, `grep -c 'property="og:image"'`, `grep -c 'name="twitter:card" content="summary_large_image"'`, `grep -c 'rel="alternate" type="text/plain"'` and `grep -c 'rel="icon"'` returns exactly `1`.
- `grep -c 'property="og:image"' /tmp/home.html` returns `1` and not `2` — the file-convention tag is not duplicated by a hand-written `openGraph.images`.
- The `<noscript>` contains no career text: `grep -A5 '<noscript>' /tmp/home.html | grep -cE 'Optimism|Metropolis|ConsenSys|Stitch Fix'` returns `0`.
- Privacy (DEC-015): `curl -s http://localhost:3000/resume.txt http://localhost:3000/kevinweaver.1 http://localhost:3000/ | grep -c '<redacted-personal-phone>'` returns `0`, and `grep -rc 'tel:' /tmp/home.html` returns `0`.
- `git diff --name-only origin/main...HEAD` lists exactly `app/layout.tsx`, `app/opengraph-image.tsx`, `app/kevinweaver.1/route.ts`, `app/resume.txt/route.ts` and `public/og.png`.
- `git diff origin/main...HEAD -- app/layout.tsx` touches only the `metadata` export and adds exactly one `<noscript>` element; the font loader, the `viewport` export, the `<html>` `className` and every other JSX node are unchanged.

### At-merge gate

- The `ci-ok` status is green on the exact PR head.
- `package.json` and `package-lock.json` are unchanged in the diff — DEC-003, and the proof that `next/og` needed no dependency.
- No file under `content/`, `app/regions/`, `components/`, `styles/`, `lib/`, `scripts/`, `.github/` or `next.config.ts` appears in the diff.
- If `lib/viz/tokens/ramp.ts` exists on the merge base, its ten ramp hexes and the ten in `app/opengraph-image.tsx` are identical, in order: comparing the two `grep -oiE '#[0-9a-f]{6}'` outputs produces no difference.
- `npm run build` is green on the merge base with `public/data/v1/` absent, proving the payload-free tier is the default and not an untested branch.
- The three new routes still appear as `○ (Static)` in the merge-base build — a route that silently became dynamic has acquired a runtime error surface this ticket exists to remove.

### Human/manual evidence

- Paste the branch's Vercel preview URL into a social-card validator (or a private Slack message) and confirm a 1200×630 gruvbox card renders with the title and description, not a bare link. This is an operator check on a preview deployment, never a PR gate — C-22: `vercel.deployment.*` emits no dispatch on `ignored`/`skipped`/`error`, so a required check built on it waits forever.
- Confirm with the operator that the title string in `<title>`, `og:title` and on the card is the variant GATE-005 (c) settled on, and that the Twitter handle rendered into `twitter:site` is the one GATE-005 (a) chose.

## Failure, security, migration, and accessibility cases

**Privacy — the highest-severity concern on this ticket.** `/resume.txt` and `/kevinweaver.1` are plain-text, unauthenticated, CDN-cached and trivially scraped; they are the easiest surface on the whole site to harvest. DEC-015 is absolute: `<redacted-personal-phone>` never enters the repository or the build output, and no obfuscation counts as compliance (`content-ia` §11.1 measured that OCR and headless execution are standard in scraping pipelines, and that the number is a South Jersey area code on a California resume — i.e. very likely a legacy account-recovery factor for someone who publicly works on crypto infrastructure). The same rule covers `kevinweaver2@gmail.com`, which `content-ia` §11.2 flags as a personal recovery address that must not be published without an explicit spoken "yes". Both routes emit exactly `IDENTITY.email` and never construct an address. `IDENTITY.location` is `California, USA` and must not be narrowed; the timezone must not be printed at finer granularity than `America/Los_Angeles`.

**Silent failure is the design risk.** A social card that errors renders as *no card*, with no error visible to anyone, on every platform that matters. Three mitigations are structural rather than defensive: the route is statically generated so a render failure is a red build rather than a silent 500; the payload is optional so an absent pipeline degrades instead of throwing; and the committed `public/og.png` is a byte-exact last resort whose path is exercised by `KW_OG_FALLBACK=1` in the agent gate.

**Freshness.** The roff revision date and the `/resume.txt` footer are evaluated once at module load — i.e. at `next build` for these statically generated routes — which is exactly roff's semantics for "the date the page was last revised". KW-028 rebuilds and redeploys daily, so the date tracks the deploy. This mirrors KW-016's `REVISION_DATE` decision deliberately; the two must not disagree.

**Staleness in copy.** The 150-character meta description contains one time-relative claim, "Sixteen years of commits", which is correct from February 2026 and becomes wrong in February 2027. It is a career-span statement, not a contribution figure, so DEC-008 does not reach it — but it is the one string on this surface with an expiry date, and it is recorded here so the next person finds it.

**Security.** No secret, token or environment variable is read except `KW_OG_FALLBACK`, which is a boolean test switch with no production meaning. No user input reaches any route: all three are prerendered, take no parameters and read no headers or cookies. There is no HTML injection surface because the two text routes emit `text/plain` and `text/troff`, and roff control characters are escaped (`\` → `\e`, leading `.`/`'` → `\&`). No new dependency is introduced, so the supply-chain surface is unchanged.

**Migration.** `/resume.txt` and `/kevinweaver.1` are new URLs; nothing links to them today except `IDENTITY.curlLines`, which currently promises them. `/opengraph-image` replaces nothing — no card exists. `public/favicon.ico` keeps its URL; the change is that a `<link rel="icon">` finally points at it. There is no data migration and no redirect to add: the apex→www 308 is domain-level Vercel configuration (VC-4: provably not a Next `redirects()` entry) and preserves the path, measured this session.

**Accessibility.** `og:image:alt` is a real alternative text, not decoration — it is what a screen-reader user hears when someone shares the link, and it is composed from `IDENTITY.actors` so it cannot drift from the data. The `<noscript>` block is a paragraph with two real links carrying visible, meaningful text (`/resume.txt`, `/kevinweaver.1`), not "click here". `/resume.txt` is itself an accessibility artifact: a linearised, screen-reader-friendly copy of the whole resume with no layout to navigate. This ticket adds **no** interactive element, no focus target and no ARIA attribute to the page — the heading outline and landmarks are KW-005's, the canvas text alternative is KW-025's and KW-029's, and the transport controls are KW-026's. KW-029's axe run must stay clean after this merge; the only DOM this ticket adds to `/` is one `<noscript>` and a handful of `<meta>`/`<link>` tags.

**Not applicable:** no database, no schema, no persisted state, no feature flag, no rollout sequencing, and no client JavaScript of any kind.

## Surfaces

- Reads: content/manpage.ts, content/career-log.ts, content/identity.ts, content/resume.ts, content/boot.ts, app/regions/ManPage.tsx, app/regions/CareerLog.tsx, public/data/v1/manifest.json, public/data/v1/grid.json, lib/viz/tokens/ramp.ts, styles/ds/tokens/colors.css, public/favicon.ico, docs/research/2026-07-31-content-ia.md, docs/research/2026-07-31-nextjs-upgrade.md, docs/research/2026-07-31-decomposition-synthesis.md, package.json, tsconfig.json
- Writes: app/layout.tsx, app/opengraph-image.tsx, app/resume.txt/route.ts, app/kevinweaver.1/route.ts, public/og.png
- Contracts: GET /resume.txt text/plain wire format, GET /kevinweaver.1 roff wire format, app/opengraph-image.tsx size/contentType/alt exports, app/layout.tsx metadata export
- Safety: published personal-data surface of /resume.txt and /kevinweaver.1, social-card fallback guarantee for /opengraph-image

## Sibling boundaries and open gates

Same wave (wave 4, phase 4): **KW-024** owns `lib/viz/driver.ts` and `lib/viz/testHarness.ts`; **KW-028** owns `.github/workflows/data-bundle.yml` and `scripts/pipeline/budget.ts`. Neither shares a file, a directory or a surface with this ticket.

Upstream, and what each one holds that this ticket must not touch:

- **KW-005** owns `app/layout.tsx`'s JSX tree, `app/page.tsx`, `app/regions/_contract.ts`, the seven region stubs and `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx`. Its document reserves the metadata export for this ticket by name. Extend that export and add one `<noscript>`; change nothing else in the file, and in particular do not remove the `<html>` `className` (it carries the font variable) or the font loader (KW-004 swaps it later, under its own coordination item).
- **KW-006** owns `content/**` exclusively. If a string is wrong, a heading is missing or a link needs a note, that is a one-line change in `content/` under KW-006 — never a patch here. This ticket authors no resume copy.
- **KW-016** owns `app/regions/ManPage.tsx` and renders `MAN_PAGE` into the pager. It exports nothing this ticket imports; the dependency exists so the pane and the text routes are known to agree. Its abridged-pane hint (`MAN_ABRIDGED_HINT`) becomes honest once `/kevinweaver.1` is real.
- **KW-017** owns `app/regions/CareerLog.tsx` and `components/ds/CommitLog.tsx`. Same shape of dependency: read `content/career-log.ts`, never `CommitLog`.

Downstream:

- **KW-029** runs the accessibility gate over the assembled page and owns `components/viz/ContributionTable.tsx` — the DEC-011 visually hidden table that is the canvas's text alternative and its own SEO surface. That table is not this ticket's `<noscript>`, and the two must not overlap in content.
- **KW-030** hard-gates Lighthouse **SEO at 1.0** and accessibility at 1.0. The metadata written here is what makes the SEO score reachable: `document-title`, `meta-description`, `is-crawlable` and `canonical` are all audits this ticket satisfies. `robots.txt` is deliberately absent and the audit is not applicable when the file 404s.
- **KW-032** composes `app/page.tsx`, verifies the production deployment and owns the feature-level operator evidence, including confirming the card unfurls from the real domain.

**Open gates.** **GATE-005 (HG-5)** blocks pickup — it gates KW-006 and transitively KW-016, KW-017 and this ticket. Three of its six questions surface directly here: the Twitter handle in `twitter:site`/`twitter:creator` (a), the email printed in `/resume.txt` (b), and the job title in `<title>`, `og:title` and on the card (c). All three are read from `content/identity.ts`, so when the gate clears this ticket needs no edit. **GATE-002 (HG-2, `workflow` scope)** does not apply: nothing here writes `.github/workflows/**`. **GATE-004 (HG-4, Vercel dashboard settings)** does not block authoring; it only affects whether the eventual deploy succeeds, which is KW-032's verification.
