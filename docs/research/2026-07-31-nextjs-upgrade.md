# Next.js Upgrade Track — Research

Date: 2026-07-31
Scope: take `kevinweaver-dev` from Next 10.1.3 / React 17 / Tailwind 2 to a modern Next app **without changing hosting** (Vercel stays).
Every claim is marked **(M)** measured or **(I)** inferred.

---

## 0. Corrections to the incoming brief

Three premises handed to this track were checked. Two were wrong on disk, one was right but incomplete.

### 0.1 (M) The design system CSS files are NOT on disk. `_ds/` is an empty directory tree.

```
$ find docs/design/_ds -type f | wc -l
0
$ find docs/design/_ds -type d | wc -l
4
$ find /home/everdred/github/everdred/kevinweaver-dev -iname "*.woff*" -o -iname "*.ttf" -o -iname "*.otf" | wc -l
0
```

`docs/design/kevinweaver.dev.dc.html` `<link>`s **11 stylesheets** plus `_ds_bundle.js` and `./support.js` out of
`_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/`, and **none of them exist**. The comp
currently renders unstyled. This is a blocking prerequisite for every UI ticket, not a detail.

### 0.2 (M) The assets are retrievable via `DesignSync`. Project ID matches the `_ds/` folder name exactly.

```
DesignSync list_projects
 -> {"projectId":"583945d5-2203-4320-8a4e-b30afe61181d","name":"SWE·RTS Terminal Design System","isOwned":true}
```

`DesignSync list_files` on that project returns 130+ paths including:

- `tokens/{colors,typography,spacing,effects,fonts}.css`
- `layers/{base,type,pane,tmux,data}.css`
- `assets/fonts/*.woff2` — **12 files** (6 roman + 6 italic subsets)
- `components/{chrome,data,media,slide}/*.jsx` **each with a hand-written `.d.ts`**
- `SKILL.md`, `_adherence.oxlintrc.json`, `readme.md`, `styles.css`

So the brief's phrase "the design system ships raw CSS files with custom properties" and "the woff2 subsets that ship
with the design system" are both **true of the remote project** and **false of the working tree**. They must be pulled.

### 0.3 (M) The gruvbox hex values in the brief are correct — verified against the real `tokens/colors.css`.

Fetched `tokens/colors.css` verbatim. All 26 base palette values match the brief exactly. The file additionally ships a
**semantic alias layer** the brief did not mention, which is the layer UI code should actually consume:

```css
--surface-deck:#0f1011; --surface-slide:var(--bg0); --surface-pane:var(--bg-h);
--surface-bar:var(--bg1);  --surface-raised:var(--bg2);
--text-strong:var(--fg0); --text-body:var(--fg1);  --text-muted:var(--fg2);
--text-dim:var(--fg3);    --text-faint:var(--fg4); --text-comment:var(--gray);
--border-pane:var(--bg2); --border-hard:var(--bg-h); --border-dashed:var(--bg3);
--status-ok:var(--green); --status-warn:var(--yellow); --status-bad:var(--red);
--diff-add:var(--green);  --diff-del:var(--red);    --diff-mod:var(--yellow);
--accent:var(--aqua);     --accent-d:var(--aqua-d);
```

The header comment states: `--accent / --accent-d are re-pointed per slide or per section, inline.` This drives a
non-obvious Tailwind v4 requirement — see §4.3.

### 0.4 (M) The type scale is already half re-derived. The comp overrides it inline.

`tokens/typography.css` is authored for the 1920x1080 slide canvas (`--fs-hero:200px --fs-stat:240px --fs-h1:108px
--fs-h2:72px --fs-h3:52px --fs-lead:40px --fs-body:30px --fs-mono:28px --fs-small:24px --fs-micro:24px`).

But `kevinweaver.dev.dc.html:48` overrides them inline with **web-scale px values**:

```html
<div style="--bar-h:32px;--fs-micro:11px;--fs-small:12px;--fs-mono:13px;--fs-body:14px;--fs-lead:17px;--fs-h3:22px;
            --pane-pad:16px 18px;--pane-gap:14px;--tmux-h:40px;--accent:var(--aqua);--accent-d:var(--aqua-d);
            font-family:var(--mono);background:var(--bg0);color:var(--fg1);min-height:100vh;
            font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased">
```

So the body scale is **given, not invented**. Only the display sizes need deriving. Slide→web ratios:

| token | slide | comp (web) | ratio |
|---|---|---|---|
| `--fs-body`  | 30px | 14px | 0.467 |
| `--fs-mono`  | 28px | 13px | 0.464 |
| `--fs-small` | 24px | 12px | 0.500 |
| `--fs-micro` | 24px | 11px | 0.458 |
| `--fs-lead`  | 40px | 17px | 0.425 |
| `--fs-h3`    | 52px | 22px | 0.423 |

(I) Ratio clusters at ~0.45. Applying 0.45 to the untranslated display tokens gives desktop targets
`--fs-h2 ≈ 32px`, `--fs-h1 ≈ 49px`, `--fs-hero ≈ 90px`, `--fs-stat ≈ 108px`. Clamp these; leave body sizes fixed
(they are already terminal-correct and a monospace terminal UI should not fluidly scale its body text).

---

## 1. (M) Current stable versions

Measured `2026-07-31` on this machine (`npm view <pkg> version` / `dist-tags`).

| package | `latest` | note |
|---|---|---|
| `next` | **16.2.12** | `beta` 16.0.0-beta.0, `canary` 16.3.0-canary.104 |
| `react` | **19.2.8** | |
| `react-dom` | **19.2.8** | |
| `tailwindcss` | **4.3.3** | `v3-lts` dist-tag exists at 3.4.19 |
| `@tailwindcss/postcss` | **4.3.3** | |
| `typescript` | **7.0.2** | ⚠️ see §5.2 — do **not** install this |
| `eslint` | 10.8.0 | |
| `eslint-config-next` | 16.2.12 | |
| `postcss` | 8.5.25 | |
| `prettier` | 3.9.6 | |
| `vitest` | 4.1.10 | |
| `@playwright/test` | 1.62.1 | |
| `@biomejs/biome` | 2.5.6 | |
| `oxlint` | 1.76.0 | |

Environment: `node -v` → **v24.18.0**, `npm -v` → **11.16.0** (M). Next 16 `engines.node` is `>=20.9.0` (M,
`npm view next@16.2.12 engines`). Local Node is fine.

Next 16 peer deps (M): `react`/`react-dom` `^18.2.0 || ^19.0.0`; optional peers `sass ^1.3.0`,
`@playwright/test ^1.51.1`, `babel-plugin-react-compiler *`.

### 1.1 Next 16 facts that change the plan (M, https://nextjs.org/blog/next-16)

- **Turbopack is the default bundler** for dev and build. Opt out with `next build --webpack`.
- **`next lint` is REMOVED.** `next build` no longer runs linting. The release notes literally say
  *"Use Biome or ESLint directly."* A codemod exists: `npx @next/codemod@canary next-lint-to-eslint-cli .`
- Minimums: **Node 20.9+**, **TypeScript 5.1+**, browsers **Chrome/Edge/Firefox 111+, Safari 16.4+**.
- `middleware.ts` → **`proxy.ts`** (middleware deprecated, not removed).
- `params` / `searchParams` / `cookies()` / `headers()` / `draftMode()` are **async-only**.
- `serverRuntimeConfig` / `publicRuntimeConfig` removed. AMP removed.
- `images.qualities` default narrowed `[1..100]` → `[75]`; `imageSizes` dropped `16`;
  `minimumCacheTTL` 60s → 14400s; `next/image` local `src` with query strings now needs `images.localPatterns`.
- `@next/eslint-plugin-next` now defaults to **flat config**.
- React Compiler support is **stable but off by default** (`reactCompiler: true`, needs `babel-plugin-react-compiler`,
  measured `latest` = **1.0.0**). It runs via Babel and *slows builds* — see §8.4.
- Cache Components (`cacheComponents: true`, `"use cache"`) is the new opt-in caching model; `experimental.ppr` removed.

---

## 2. Incremental upgrade vs. greenfield re-scaffold → **re-scaffold in place**

### 2.1 (M) What actually exists

`git ls-files | wc -l` → **34 tracked files**. The entire application is:

- `pages/_app.js` — 7 lines, imports one stylesheet.
- `pages/index.js` — 20 lines, `<Head>` + `<HomeHero/>`, `<WriteCode/>` **commented out**.
- `pages/api/hello.js` — untouched CRA-style scaffold stub.
- `components/HomeHero.js` — ~150 lines, ~85% of which is a `<style jsx>` block.
- `components/Timeline.js`, `components/WriteCode.js` — dead (Timeline is unreferenced; WriteCode is commented out).
- `styles/globals.scss` — 20 lines, half commented out.
- `tailwind.config.js` — the untouched `create-next-app` default (`purge`, `darkMode:false`, empty `extend`).
- `postcss.config.js` — 6 lines.
- `.eslintrc.js` — generic `eslint:recommended` + `plugin:react/recommended`, **zero project rules**.
- `package.json` — still named **`"with-tailwindcss"`**, i.e. the example template name was never changed.

There is **no `next.config.js` at all** (M, `cat next.config.js` → missing).

### 2.2 (M) Existing code is actively broken, not merely dated

`components/HomeHero.js` contains real bugs that a codemod cannot fix because they are semantic:

- `<Image ... style="m-4" />` — `style` is passed a **string**. React requires an object. This is a runtime
  error in React 18+ and was silently tolerated by the old `next/image`.
- The `<style jsx>` block nests `@keyframes` **inside** `.gradient {}` and `.bounce {}`. Nested at-rules inside a rule
  are not valid plain CSS; styled-jsx is not Sass. `-webkit-text-fill-color: transparent` is commented out, and
  `text-fill-color` (unprefixed) is not a real property — which is exactly why the last three commits are
  `Fix gradient` → `add webkit-mask-image` → `WIP without gradient`. The gradient **does not currently work**.
- `.background` references `images/background.png` (relative, no leading slash) from a `<style jsx>` block.

The brief calls the 8-stop gradient in `HomeHero.js` an asset worth keeping. (M) The 8 stops are
`#64296d #d2869a #d75949 #dcaf4e #b7bb39 #90be7d #82a598 #126578` — these are **approximations of gruvbox**
(`#d2869a`≈`--purple #d3869b`, `#82a598`≈`--blue #83a598`, `#b7bb39`≈`--green #b8bb26`). (I) The correct move is not
to preserve the file but to re-derive the gradient from the canonical `--purple/--red/--orange/--yellow/--green/--aqua/--blue`
tokens — the design system already ships a `RainbowText` component and a `guidelines/type-rainbow.card.html`
(M, `DesignSync list_files`), which is the same idea done properly.

### 2.3 Recommendation

**Re-scaffold in place on the existing git history.** Do not walk 10→11→12→13→14→15→16.

Justification:

1. (I) An incremental upgrade's cost is proportional to the code you are carrying forward. Here that is ~200
   meaningful lines, all of which are slated for deletion. You would pay six upgrade hops to preserve a broken
   gradient and a commented-out component.
2. (M) The 10→11→12→13 span contains the highest-friction breaks in Next's history — `next/image` layout-prop
   rewrite, `_app`→`app/`, the `pages`→`app` router split. Every one of those hops would be spent migrating files
   we intend to `git rm`.
3. (M) `package.json` still declares `"next": "latest"` with `"name": "with-tailwindcss"`. The lockfile pins
   10.1.3 (`grep '"node_modules/next"' package-lock.json` → `"version": "10.1.3"`). There is no intent encoded in
   this manifest to preserve.
4. (I) "Re-scaffold in place" ≠ "delete the repo." Keep git history, `.gitignore`, the domain, and the two real
   assets. Replace `package.json`, configs, and `pages/` wholesale in one commit.

**Explicitly preserve:** `public/images/kevin.png` (pixel-art avatar), `.gitignore`, git history.
**Explicitly delete:** `pages/api/hello.js`, `components/Timeline.js`, `components/WriteCode.js`,
`components/HomeHero.js`, `styles/globals.scss`, `tailwind.config.js`, `postcss.config.js`, `.eslintrc.js`,
`public/vercel.svg`, and the `sass`, `react-typing-effect`, `@heroicons/react`, `@tailwindcss/jit`, `autoprefixer`
dependencies.

### 2.4 (M) Delete `yarn.lock`. Keep `package-lock.json`.

Both are committed and both are 12:42 on the same day. Vercel picks a package manager by lockfile detection;
two lockfiles is a coin flip and a source of "works locally, breaks on deploy." `npm -v` → 11.16.0 is present and
working, so standardize on npm. Also add `.nvmrc` — (M) none of `.nvmrc`, `.node-version`, `.npmrc` exist.

---

## 3. App Router vs Pages Router → **App Router**, and **do not** use `output: 'export'`

### 3.1 Recommendation

Use the **App Router**. Deploy as a normal Vercel Next build (no static export).

### 3.2 Why App Router

- (M) `create-next-app` in Next 16 ships "App Router by default, TypeScript-first configuration, Tailwind CSS, and
  ESLint." Pages Router is maintained but is no longer the paved path; every new API (Cache Components,
  `"use cache"`, PPR, `proxy.ts`, streaming/Suspense) is App-Router-only.
- (I) The RSC boundary maps almost perfectly onto this site's actual shape. The resume (man-page section, git-log
  work history, skills) is **static text that never needs to ship as JS**. As a Server Component it renders to HTML
  at build time and contributes **zero** bytes to the client bundle. Under the Pages Router, that same markup is
  serialized into `__NEXT_DATA__` *and* re-hydrated — you pay for it twice.
- (I) The site has exactly one heavy interactive island (the Gource-style canvas). That is the textbook
  `"use client"` case: one leaf component marked client, everything above it stays server. Under Pages Router the
  whole page is a client tree by definition and you reach for `next/dynamic({ ssr:false })` to claw back the same
  outcome — more machinery, worse default.
- (M) Static export supports Server Components fine ("Server Components consumed inside the `app` directory will run
  during the build, similar to traditional static-site generation"), so App Router costs nothing even if you later
  want `output: 'export'`.

### 3.3 Why NOT `output: 'export'`

The brief's instinct "mostly static → static export" is the wrong trade here. (M, static-exports guide) export mode
disables: `redirects`, `rewrites`, `headers`, `proxy`, ISR, Draft Mode, Server Actions, and **image optimization with
the default loader**.

- (M) The site *already depends on a redirect*: apex `kevinweaver.dev` 308s to `https://www.kevinweaver.dev/`. That
  is currently Vercel-project-level config, but `headers` is the natural place to add CSP/caching for the JSON data
  file, and export mode forecloses it.
- (M) `next/image` default loader is unavailable under export. `public/images/kevin.png` is pixel art — it wants
  `unoptimized` anyway — but the two GitHub avatars (`its-everdred`, `its-applekid`) are remote images that benefit
  from optimization.
- (I) Vercel already serves App Router prerendered pages from its edge CDN as static assets. `output: 'export'` buys
  no measurable latency on Vercel; it only buys portability the user has explicitly said they don't need
  ("Infra must not change"). Cost > benefit.

### 3.4 (I) Concrete route/boundary plan

```
app/
  layout.tsx            server. <html>, next/font var, imports globals.css
  page.tsx              server. renders whole resume from a typed const — 0 KB JS
  opengraph-image.tsx   server. ImageResponse, gruvbox + JetBrains Mono
  components/
    Pane.tsx  PaneBar.tsx  TmuxBar.tsx  CommitLog.tsx   server (ports of DS .jsx)
    ContributionGrid.tsx   server — it's an SVG/CSS grid of static squares
    GourceCanvas.tsx       "use client" — the ONLY client component
public/data/
  contributions.json     recent-first (see §3.5)
  history/*.json         lazy-loaded older years
```

(I) `ContributionGrid` deserves emphasis: a 5-year contribution grid is ~1825 `<rect>`s with a fill from a log2 band.
It has no interactivity beyond a tooltip. Render it **on the server** as inline SVG. Only the tooltip needs
`"use client"`, and that can be a `title`/CSS-only affordance to keep it at zero JS.

### 3.5 (I) The backwards-in-time requirement is a data-shape constraint, and App Router handles it better

"Newest first, walking back into history" means the first byte must contain recent data and history must arrive later.
Under App Router: the server component inlines the most recent window into the initial HTML/RSC payload, and the
client island `fetch()`es `public/data/history/YYYY.json` on demand as playback walks backwards. Under Pages Router
you would have to either ship it all in `__NEXT_DATA__` (defeats the point) or hand-roll the same fetch. Same work,
but App Router gives you Suspense boundaries for free.

---

## 4. Tailwind v2 + `@tailwindcss/jit` → v4

### 4.1 (M) What changes mechanically

| | v2 (current) | v4 |
|---|---|---|
| PostCSS plugin | `@tailwindcss/jit` + `autoprefixer` | **`@tailwindcss/postcss`** only |
| entry CSS | `@tailwind base/components/utilities` | `@import "tailwindcss";` |
| config | `tailwind.config.js` (`purge`, `variants`) | **CSS-first `@theme`**; JS config deprecated |
| content scan | `purge: [...]` glob array | automatic source detection + `@source` |
| autoprefixer | separate dep | **built in, remove it** |
| `postcss-import` | separate dep | **built in, remove it** |
| safelist | `safelist:` config key | `@source inline(...)` |

(M) v4 upgrade guide: *"imports and vendor prefixing is now handled for you automatically, so you can remove
`postcss-import` and `autoprefixer`."* `corePlugins`, `safelist`, `separator` are **not supported** in a JS config
under v4. `@config "../tailwind.config.js"` still loads a legacy config but is no longer auto-detected — we won't use it.

(M) **Browser floor:** Tailwind v4 needs **Safari 16.4+, Chrome 111+, Firefox 128+** (it depends on `@property` and
`color-mix()`). Next 16 needs Firefox **111+**. (I) Tailwind is therefore the binding constraint at Firefox 128.
Acceptable for an audience of engineer peers; worth writing down so nobody is surprised.

### 4.2 Concrete files

`postcss.config.mjs` — replaces `postcss.config.js` entirely:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`tailwind.config.js` — **deleted**, not migrated.

### 4.3 The gruvbox tokens in `@theme` — and why `inline` is mandatory

**Do not retype the hex values into `@theme`.** Import the design system's `tokens/colors.css` verbatim and *bridge*
it. Rationale in §6.

```css
/* app/globals.css */
@import "tailwindcss";

/* Vendored verbatim from DesignSync project 583945d5-…. Do not hand-edit. */
@import "../styles/ds/tokens/colors.css";
@import "../styles/ds/tokens/spacing.css";
@import "../styles/ds/tokens/effects.css";

@theme inline {
  /* ---- backgrounds ---- */
  --color-bg-h: var(--bg-h);
  --color-bg0: var(--bg0);
  --color-bg1: var(--bg1);
  --color-bg2: var(--bg2);
  --color-bg3: var(--bg3);
  --color-bg4: var(--bg4);
  --color-gray: var(--gray);

  /* ---- foregrounds ---- */
  --color-fg0: var(--fg0);
  --color-fg1: var(--fg1);
  --color-fg2: var(--fg2);
  --color-fg3: var(--fg3);
  --color-fg4: var(--fg4);

  /* ---- bright hues ---- */
  --color-red: var(--red);       --color-green: var(--green);
  --color-yellow: var(--yellow); --color-blue: var(--blue);
  --color-purple: var(--purple); --color-aqua: var(--aqua);
  --color-orange: var(--orange);

  /* ---- dim hues ---- */
  --color-red-d: var(--red-d);       --color-green-d: var(--green-d);
  --color-yellow-d: var(--yellow-d); --color-blue-d: var(--blue-d);
  --color-purple-d: var(--purple-d); --color-aqua-d: var(--aqua-d);
  --color-orange-d: var(--orange-d);

  /* ---- semantic aliases: what UI code should actually use ---- */
  --color-surface-deck: var(--surface-deck);
  --color-surface-slide: var(--surface-slide);
  --color-surface-pane: var(--surface-pane);
  --color-surface-bar: var(--surface-bar);
  --color-surface-raised: var(--surface-raised);
  --color-text-strong: var(--text-strong);
  --color-text-body: var(--text-body);
  --color-text-muted: var(--text-muted);
  --color-text-dim: var(--text-dim);
  --color-text-faint: var(--text-faint);
  --color-text-comment: var(--text-comment);
  --color-border-pane: var(--border-pane);
  --color-border-hard: var(--border-hard);
  --color-border-dashed: var(--border-dashed);
  --color-status-ok: var(--status-ok);
  --color-status-warn: var(--status-warn);
  --color-status-bad: var(--status-bad);

  /* ---- section-scoped accent. `inline` is REQUIRED here. ---- */
  --color-accent: var(--accent);
  --color-accent-d: var(--accent-d);

  /* ---- one family ---- */
  --font-mono: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ---- web type scale (see §0.4) ---- */
  --text-micro: 11px;
  --text-small: 12px;
  --text-mono:  13px;
  --text-body:  14px;
  --text-lead:  17px;
  --text-h3:    22px;
  --text-h2: clamp(24px, 2.4vw, 32px);
  --text-h1: clamp(32px, 3.8vw, 49px);
  --text-hero: clamp(44px, 7vw, 90px);
  --text-stat: clamp(52px, 8.4vw, 108px);

  --leading-tight: .9;
  --leading-heading: 1.04;
  --leading-body: 1.55;
  --leading-code: 1.6;
  --tracking-display: -.02em;
  --tracking-heading: -.01em;
  --tracking-caps: .16em;
}
```

**Why `@theme inline` and not plain `@theme`** (M, https://tailwindcss.com/docs/theme): plain `@theme` emits
`.text-accent { color: var(--color-accent) }`, where `--color-accent` is frozen at `:root`. `@theme inline` emits
`.text-accent { color: var(--accent) }` — a live reference. Since `tokens/colors.css` explicitly documents that
`--accent` is *"re-pointed per slide or per section, inline"*, only the `inline` form lets
`<section style={{"--accent":"var(--red)"}}>` actually recolor `text-accent`/`bg-accent` descendants. Using plain
`@theme` here would silently break the design system's core theming mechanism. This is the single highest-risk
detail in the Tailwind migration.

(I) Also note `--text-body: 14px` and `--color-text-body` coexist without collision — they are different Tailwind
namespaces (`--text-*` = font-size, `--color-*` = color), so `text-body` resolves as a font-size utility and
`text-text-body` as the color. Rename the semantic color alias if that reads badly; flagging it now because it will
confuse an agent later.

---

## 5. TypeScript → **yes, adopt it. Pin to 5.9.3.**

### 5.1 The argument

**Against.** (I) It is a solo portfolio site. TS adds a compile step, `@types/*` churn, and `tsconfig.json`
bikeshedding. For ~1000 lines of mostly-static JSX the type system catches little that a render wouldn't.

**For.** (M) Three concrete, measured reasons that dominate the above:

1. **The design system already ships types.** Every component in the DS has a hand-written `.d.ts` next to its
   `.jsx` — e.g. `components/chrome/Pane.d.ts` documents `title?`, `dots?`, `titleColor?`, `right?`, `focus?`,
   `bleed?`, and critically annotates *"At most ONE focused pane per slide."* Adopting TS makes that documentation
   **enforced** rather than decorative. Rejecting TS throws away work that already exists.
2. **Agents need a non-interactive correctness gate.** (I) The stated implementation model is autonomous agents. An
   agent cannot see a browser. `tsc --noEmit` is the only cheap, deterministic, exit-code-based signal that a
   refactor didn't break a prop contract. Without it the feedback loop is "the build succeeded and the page is
   blank."
3. **The data layer is the real payoff.** (I) `contributions.json`, the GitHub GraphQL response shape, and the
   Gource event stream (repo → file → actor → timestamp) are the parts most likely to break. A `zod` (4.4.3) schema
   validated at generation time plus inferred TS types across the client boundary turns a class of runtime
   nulls into build failures. This is worth more than typed JSX.
4. (M) The existing codebase demonstrates the failure mode: `<Image style="m-4" />` in `HomeHero.js` passes a string
   where React demands an object. TS rejects that at compile time. It has been shipped and broken since 2021.

**Recommendation: adopt TypeScript.** Strict mode. `tsc --noEmit` as a required script.

### 5.2 ⚠️ (M) Do NOT install `typescript@latest`. It is 7.0.2 and it will break the lint stack.

```
$ npm view typescript version            -> 7.0.2
$ npm view eslint-config-next@16.2.12 dependencies
  { "typescript-eslint": "^8.46.0", ... }
$ npm view typescript-eslint@8.65.0 peerDependencies
  { "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
    "typescript": ">=4.8.4 <6.1.0" }
```

TypeScript 7 is the **Go-native rewrite** (M, https://devblogs.microsoft.com/typescript/typescript-native-port/:
*"When the native codebase has reached sufficient parity… we'll be releasing it as TypeScript 7.0"*; the JS codebase
continues as TypeScript 6). `typescript-eslint@8.65.0` — which `eslint-config-next` depends on — peers
`typescript >=4.8.4 <6.1.0`. **7.0.2 is outside that range**, so `npm install` under npm 11 will hard-error on the
peer conflict.

(M) Published stable lines: `5.9.3` is the last 5.x; `6.0.3` exists (no dist-tag points at it). Next 16 requires
TS >= 5.1.0.

**Pin `"typescript": "5.9.3"`** — inside typescript-eslint's range, comfortably above Next's floor, and the
best-supported version across the ecosystem today. Revisit when typescript-eslint ships TS 7 support.
Add an explicit comment in `package.json` or `CONTRIBUTING` so an agent doesn't "helpfully" bump it.

---

## 6. Design-system CSS ⟷ Tailwind v4 → **both: import verbatim, bridge via `@theme inline`**

### 6.1 Recommendation

Vendor the DS files **unmodified** into `styles/ds/`, import them, and expose them to Tailwind through the
`@theme inline` bridge in §4.3. Do **not** transcribe hex values into `@theme`, and do **not** import the DS CSS
without a bridge.

### 6.2 Why not each alternative

- **Import as-is only** (no `@theme`): the tokens exist as CSS vars but Tailwind knows nothing about them. You get
  no `bg-bg0` / `text-fg1` utilities, so every component writes `style={{background:'var(--bg0)'}}`. Loses the whole
  point of Tailwind and, worse, loses `@source`-driven dead-CSS elimination.
- **Convert to `@theme` only** (retype hexes, delete DS CSS): forks the design system. (M) The DS is a live
  DesignSync project (`updatedAt: 2026-07-31T21:10:53Z`, i.e. edited today). A hand-transcribed copy silently drifts
  the moment Kevin edits the design. It also loses the semantic alias layer and the `--accent` re-pointing mechanism,
  which are *behaviour*, not values.
- **Both** — the DS file stays the single source of truth and is re-syncable with `DesignSync get_file`; `@theme
  inline` is a thin, mechanical, reviewable mapping.

### 6.3 Concrete layout

```
styles/ds/tokens/colors.css       <- verbatim from DesignSync, DO NOT EDIT
styles/ds/tokens/spacing.css      <- verbatim
styles/ds/tokens/effects.css      <- verbatim
styles/ds/tokens/typography.css   <- vendored for reference, NOT imported (slide-canvas scale; see §0.4)
styles/ds/tokens/fonts.css        <- vendored for reference, NOT imported (next/font owns @font-face; see §7)
styles/ds/layers/base.css         <- verbatim, imported
styles/ds/layers/type.css         <- verbatim, imported
styles/ds/layers/pane.css         <- verbatim, imported
styles/ds/layers/tmux.css         <- verbatim, imported
styles/ds/layers/data.css         <- verbatim, imported
app/globals.css                   <- the ONLY hand-written stylesheet
```

(I) Two of the eleven DS files are deliberately **not** imported — `fonts.css` because `next/font` must own
`@font-face` (§7), and `typography.css` because its px values target a 1920 canvas. Both are still vendored so the
divergence is visible in a diff rather than invisible. Add a `README` in `styles/ds/` stating the provenance
(project `583945d5-2203-4320-8a4e-b30afe61181d`) and the two exclusions.

### 6.4 (M) `@source` is needed for the vendored layer CSS

Tailwind v4's automatic source detection scans your source files for class names. The DS `layers/*.css` define
plain class selectors (`.pane`, `.pane-bar`, `.pane-title`, `.pane-body`, `.tmux`, `.seg`, `.graph`, `.commit`,
`.cmsg`, `.hash`, `.cyear`, `.rail`, `.plr`, `.pl`, `.focus`, `.dots` — measured from the comp's class vocabulary).
These are **not** Tailwind utilities and need no safelisting, but if any component composes DS classes with Tailwind
utilities via a string built at runtime, add `@source inline(...)`. (I) Prefer never building class strings
dynamically — it's also the rule that keeps agent-authored code scannable.

---

## 7. JetBrains Mono → **`next/font/local` over the 12 vendored woff2, not `next/font/google`**

### 7.1 (M) What the DS actually ships

`tokens/fonts.css` header: *"JetBrains Mono — the only typeface in the system. Weight range 300-800 plus a 400
italic; binaries are the Google Fonts woff2 subsets shipped with the source deck."* It declares **12 `@font-face`
rules**:

- 6 roman: `font-weight: 300 800` (variable), subsets `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`, `greek`, `vietnamese`
- 6 italic: `font-weight: 400`, same 6 subsets
- every rule has `font-display: swap` and a precise `unicode-range`

Matching binaries exist in the project at `assets/fonts/jetbrains-mono-*.woff2` (M, `DesignSync list_files`).

### 7.2 The comparison

| | `next/font/google` | `next/font/local` (vendored woff2) |
|---|---|---|
| network at runtime | (M) none — "CSS and font files are downloaded at build time and self-hosted… **No requests are sent to Google by the browser**" | none |
| CLS | (M) `adjustFontFallback: true` default, auto size-adjust metrics | (M) `adjustFontFallback` is `'Arial' \| 'Times New Roman' \| false` — coarser |
| variable weight 300–800 | supported; omit `weight` for a variable font | supported via `declarations`/`weight: '300 800'` |
| italic 400 | (M) `style: ['normal','italic']` | explicit second `src` entry |
| build-time network | **requires reaching Google Fonts during `next build`** | none |
| byte-identical to comp | no — Google may reserve/revise the subset split | **yes** |

### 7.3 Recommendation: `next/font/local`

(I) The deciding factor is *fidelity plus hermeticity*, not CLS. On CLS, `next/font/google` is marginally better
because it derives real size-adjust metrics; but the entire page is monospace on a dark field with a fixed-size
terminal grid, so the fallback→JetBrains swap shifts almost nothing — the metric mismatch that normally causes CLS
is a proportional-vs-mono problem this design doesn't have. Meanwhile `next/font/google` makes `next build`
depend on a live Google Fonts fetch, and it can hand you a *different* subset split than the comp was authored
against. Vendoring the exact 12 binaries the design system shipped makes the build hermetic and guarantees the
rendered result matches the comp byte for byte.

```ts
// app/fonts.ts
import localFont from "next/font/local";

export const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  adjustFontFallback: false,          // mono design; Arial metrics would be worse than none
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  src: [
    { path: "../public/fonts/jetbrains-mono-latin.woff2",         weight: "300 800", style: "normal" },
    { path: "../public/fonts/jetbrains-mono-latin-ext.woff2",     weight: "300 800", style: "normal" },
    { path: "../public/fonts/jetbrains-mono-italic-latin.woff2",     weight: "400", style: "italic" },
    { path: "../public/fonts/jetbrains-mono-italic-latin-ext.woff2", weight: "400", style: "italic" },
  ],
});
```

(I) **Ship only the `latin` + `latin-ext` subsets** (4 of 12 files). The site's content is English resume text plus
GitHub repo/file names — cyrillic, cyrillic-ext, greek and vietnamese will never be hit and are pure preload weight.
Keep the other 8 vendored but unreferenced, so adding them later is a one-line change. This is a deliberate
divergence from `tokens/fonts.css`; record it in `styles/ds/README`.

Wire-up in `app/layout.tsx`:

```tsx
<html lang="en" className={jetbrainsMono.variable}>
```

and `--font-mono: var(--font-jetbrains-mono), …` in `@theme inline` (§4.3). (M) The Next docs prescribe exactly this
`@theme inline { --font-mono: var(--font-…) }` pattern for Tailwind v4.

⚠️ (M) `next/font/local` `src` paths are resolved **relative to the file that calls the loader**, not the project
root — a classic agent stumble. Colocating `app/fonts.ts` and using `../public/fonts/...` is the least surprising layout.

---

## 8. Exact package list (all versions measured 2026-07-31)

### 8.1 dependencies

```jsonc
{
  "next": "16.2.12",
  "react": "19.2.8",
  "react-dom": "19.2.8"
}
```

That is the whole runtime list. (I) No UI library, no CSS-in-JS, no icon pack — the design system is hand-CSS and
the only typeface is loaded by `next/font`. `@heroicons/react`, `react-typing-effect`, and `sass` are all dropped.

### 8.2 devDependencies

```jsonc
{
  "typescript": "5.9.3",                 // NOT 7.0.2 — see §5.2
  "@types/react": "19.2.18",
  "@types/react-dom": "19.2.4",
  "@types/node": "26.1.2",

  "tailwindcss": "4.3.3",
  "@tailwindcss/postcss": "4.3.3",
  "postcss": "8.5.25",

  "eslint": "10.8.0",
  "eslint-config-next": "16.2.12",

  "prettier": "3.9.6",
  "prettier-plugin-tailwindcss": "0.8.1",

  "vitest": "4.1.10",
  "@vitejs/plugin-react": "6.0.5",
  "@testing-library/react": "16.3.2",
  "happy-dom": "20.11.1",

  "@playwright/test": "1.62.1",
  "tsx": "4.23.1"
}
```

Notes:
- (M) `eslint-config-next@16.2.12` transitively pulls `typescript-eslint@^8.46.0`, `eslint-plugin-react@^7.37.0`,
  `eslint-plugin-react-hooks@^7.0.0`, `eslint-plugin-jsx-a11y@^6.10.0`, `eslint-plugin-import@^2.32.0`,
  `eslint-import-resolver-typescript@^3.5.2`, `globals@16.4.0`. Do not add these individually.
- (M) `autoprefixer` and `postcss-import` are **removed** — built into `@tailwindcss/postcss`.
- (M) `prettier-plugin-tailwindcss@0.8.1` peers `prettier ^3.0` ✓.
- (M) `@playwright/test ^1.51.1` is an optional peer of Next 16, so 1.62.1 satisfies it.
- (I) `happy-dom` over `jsdom` (30.0.1): faster, and this app has no exotic DOM needs.
- (I) `tsx` is for running the data-generation script (`scripts/fetch-contributions.ts`) outside the Next build.

### 8.3 Data fetching

(M) `@octokit/graphql` = **9.0.3**. (I) Use it in a **build-time / cron script**, not at request time — the ground
truth says data is regenerated on a schedule with no live client transport. Output committed or generated JSON under
`public/data/`. Add `zod` **4.4.3** to validate the GitHub response at generation time and to derive the TS types
consumed by both the server components and the canvas island.

(I) `swr` (2.4.2) is **only** needed if the backwards-in-time playback lazy-loads `history/YYYY.json` and you want
request dedup/caching. A bare `fetch` + a `Map` cache is probably enough for one island. Defer.

### 8.4 Canvas / animation — coordinate with the viz track

Measured candidates, no recommendation made here (owned by the viz track):

| package | version | fit |
|---|---|---|
| `pixi.js` | 8.19.0 | WebGL renderer; strongest for thousands of animated file-circles |
| `d3-force` | 3.0.0 | force layout for repo/file circle packing |
| `d3-hierarchy` | 3.1.2 | `d3.pack()` — nested circles is literally circle packing |
| `d3-scale` | 4.0.2 | log2 contribution bands → colour |
| `d3-interpolate` | 3.0.1 | colour/position tweening |
| `d3-timer` | 3.0.1 | rAF loop |
| `d3-quadtree` | 3.0.1 | hit-testing / collision |
| `d3` (bundle) | 7.9.0 | avoid — pulls modules you don't need |
| `motion` / `framer-motion` | 12.43.0 | DOM transitions, not canvas |
| `@types/d3` | 7.4.3 | types for the above |

(I) `d3-hierarchy` + `d3-force` for **layout** and Pixi (or raw Canvas2D) for **rendering** is the natural split;
importing the `d3` meta-package is the thing to avoid on a bundle-size-sensitive island.

### 8.5 Linting / formatting — the Next 16 wrinkle

(M) `next lint` is removed and `next build` no longer lints. You must wire lint yourself. Two viable stacks:

**A. ESLint 10 + `eslint-config-next` 16.2.12 (recommended).** (I) Keeps the Next-specific rules
(`no-html-link-for-pages`, `no-sync-scripts`, `no-img-element`, RSC boundary checks) that only Vercel ships. Flat
config is now the default for `@next/eslint-plugin-next` (M). Cost: transitively couples you to
`typescript-eslint`'s TS `<6.1.0` ceiling (§5.2).

**B. Biome 2.5.6 or oxlint 1.76.0.** (M) Both are explicitly blessed by the Next 16 release notes ("Use Biome or
ESLint directly"), both are dramatically faster, and neither depends on the TS compiler API — so neither blocks a
future TS 7 bump. (M) Notably the design system itself ships `_adherence.oxlintrc.json`, i.e. **oxlint is already
the DS's own lint tool**. Cost: you lose the Next-specific rules.

(I) Recommend **A now, with B as a fast pre-commit pass** — and specifically adopt the DS's
`_adherence.oxlintrc.json` as a second oxlint config so agent-authored components are checked against the design
system's own adherence rules. That last point is the highest-leverage and least obvious item in this section.

Formatting: `prettier` 3.9.6 + `prettier-plugin-tailwindcss` 0.8.1 (class sorting — (I) valuable specifically because
it makes agent-authored class lists diff-stable).

### 8.6 Deliberately NOT included

- `sharp` (0.35.3) — Vercel provides image optimization; only needed for self-hosted `next start`.
- `babel-plugin-react-compiler` (1.0.0) — (M) React Compiler is stable but off by default and "relies on Babel," so
  it *disables Turbopack's fast path and increases build time*. (I) A ~1000-line site with one memo-sensitive canvas
  gains nothing. Skip.
- `next-themes` (0.4.6) — gruvbox dark is the only theme.
- `@vercel/analytics` (2.0.1) / `@vercel/speed-insights` (2.0.0) — (I) available cheaply if wanted; not required.

---

## 9. Migration order

Each step ends with a repo that installs, builds, and can be committed. Steps 1–4 are strictly sequential; 5–11 are
mostly independent once 4 lands.

**0. Prerequisite (blocks everything visual).** Pull the design system from DesignSync project
`583945d5-2203-4320-8a4e-b30afe61181d` into `styles/ds/` and `public/fonts/`. Nothing about the UI can be built until
`_ds/` stops being empty (§0.1). Do this first, independently of the framework work.

**1. Repo hygiene.** `git rm yarn.lock`. Add `.nvmrc` (`24`). Rename `package.json` `"name"` from `"with-tailwindcss"`
to `"kevinweaver-dev"`. Add `vercel.json` only if a redirect/header is actually needed — otherwise omit and let
Vercel's zero-config detection work. *Builds: yes (still Next 10).*

**2. Prune dead code.** `git rm pages/api/hello.js components/Timeline.js components/WriteCode.js public/vercel.svg`.
Remove the `<WriteCode/>` import from `pages/index.js`. *Builds: yes (still Next 10).* This is deliberately separate
from step 3 so the deletion is reviewable on its own.

**3. Framework jump — one commit, no intermediate hops.** Replace `package.json` deps with §8.1 + §8.2. Delete
`tailwind.config.js`, `postcss.config.js`, `.eslintrc.js`, `styles/globals.scss`, `components/HomeHero.js`,
`pages/`. Add `app/layout.tsx` + `app/page.tsx` with placeholder content, `next.config.ts`, `tsconfig.json`
(strict), `postcss.config.mjs` (§4.2), `app/globals.css` with just `@import "tailwindcss";`. `npm install`,
`npx next build`. *Builds: yes — a blank styled page. This is the riskiest single step; keep it content-free so any
failure is unambiguously a config failure.*

**4. Typecheck + lint gate.** Add `"typecheck": "tsc --noEmit"`, `"lint": "eslint ."`, `eslint.config.mjs` (flat,
extending `eslint-config-next`), `prettier` config. Add `.github/workflows/ci.yml` running install → typecheck →
lint → build. (M) No CI exists today and `next build` no longer lints, so without this there is **no** automated
gate at all. *Builds: yes.*

**5. Fonts.** Vendor the 4 latin woff2 into `public/fonts/`, add `app/fonts.ts` (§7.3), apply
`jetbrainsMono.variable` on `<html>`. *Builds: yes.*

**6. Tokens + Tailwind bridge.** Import `styles/ds/tokens/*.css` and add the `@theme inline` block (§4.3). Add
`styles/ds/README` recording provenance and the two non-imported files. Verify `bg-bg0` / `text-fg1` /
section-scoped `--accent` override all resolve. *Builds: yes.*

**7. DS layers + chrome components.** Import `styles/ds/layers/*.css`. Port `Pane`, `PaneBar`, `TmuxBar` from the
DS `.jsx` + `.d.ts` into typed server components. *Builds: yes.*

**8. Resume content.** Render the man-page + git-log sections from a typed `const RESUME` (six roles, education,
skills). Pure server components, zero client JS. *Builds: yes. Site is now genuinely shippable.*

**9. Data pipeline.** `scripts/fetch-contributions.ts` (`@octokit/graphql` 9.0.3 + `zod` 4.4.3), combining
`its-everdred` + `its-applekid`, emitting recent-first `public/data/contributions.json` plus
`public/data/history/YYYY.json`. Add a scheduled GitHub Action. *Builds: yes.*

**10. Contribution grid.** Server-rendered inline SVG, log2 doubling bands, 5-year default. *Builds: yes.*

**11. Gource canvas island.** `"use client"`, the only client component. Backwards-in-time playback reading the
step-9 JSON. Coordinate library choice with the viz track (§8.4). *Builds: yes.*

(I) Steps 0–8 deliver a complete, correct, shippable resume site. 9–11 are the dashboard half. If the canvas work
stalls, the site is still live and good — that ordering is the point.

---

## 10. Open questions

1. Does the Vercel project currently build from `main` with zero config, and does it have a build command override
   pinned to something Next-10-specific? Not measurable without the Vercel dashboard.
2. `_ds_bundle.js` and `templates/terminal-deck/support.js` exist in the DS project — are they runtime-required by
   the layer CSS (e.g. powerline glyph measurement), or deck-only? Needs a read of `layers/base.css` and the bundle.
3. `DesignSync` `SKILL.md` and `_adherence.oxlintrc.json` imply an authoring contract for DS components. Should the
   repo adopt that oxlint config verbatim as a second lint pass?
4. `--fs-stat` / `--fs-hero` clamp values in §4.3 are derived from a 0.45 ratio, not from a designed mobile comp.
   Wants a visual check at 375px.
5. Is `www.kevinweaver.dev` vs apex handled by Vercel project settings or a `vercel.json` that doesn't exist yet? If
   the latter is desired, it is incompatible with `output: 'export'` (§3.3) — already recommended against.

---

# Verification corrections

Adversarial re-verification, 2026-07-31 23:45–00:15 UTC. Every item below was re-run from scratch. Sections not
listed here were checked and held. **All 35 package versions in §1 / §8 were re-measured with `npm view` and every
one matched exactly.** The Tailwind, static-export, `next/font`, and Next-16 doc quotes were re-fetched and are
verbatim-accurate. The corrections are:

## VC-1 — §0.1 is STALE. `_ds/` is no longer empty, and it says "11 stylesheets" when the comp links 10.

```
$ find docs/design/_ds -type f | wc -l
9
$ grep -c 'rel="stylesheet"' docs/design/kevinweaver.dev.dc.html
10
$ git ls-files docs/design | wc -l
11
```

The 9 files — `tokens/{colors,typography,spacing,effects}.css` and `layers/{base,pane,tmux,type,data}.css` — are on
disk **and committed** (`git log -1` → `d637182`). They were written at `16:37:49`; this doc's own mtime is
`16:43:49`, i.e. they landed **6 minutes before the doc was saved**.

`docs/design/support.js` also exists (69 KB, mtime `16:36:42` — **7 minutes before** the doc was saved), so §0.1's
"`_ds_bundle.js` and `./support.js` … none of them exist" was already false at write time for `support.js`.

Still genuinely absent, and this part of §0.1 is **confirmed**:

- `tokens/fonts.css` (the 1 of 10 linked stylesheets that is missing)
- `_ds_bundle.js`
- all fonts: `find . \( -iname '*.woff*' -o -iname '*.ttf' -o -iname '*.otf' \) | wc -l` → **0**

**Correction to §9 step 0.** It is not "blocks everything visual." The tokens and layers — i.e. everything §4.3 and
§6.3 depend on — are available now. Step 0 reduces to: pull the **12 woff2 binaries** (only 4 are used per §7.3),
and optionally `tokens/fonts.css`, which §6.3 already says is vendored-but-not-imported. Steps 6 and 7 are unblocked
today; only step 5 (Fonts) still needs DesignSync.

## VC-2 — §5.2's conclusion is right; both of its stated failure modes are wrong.

Confirmed: `npm view typescript version` → `7.0.2`; `eslint-config-next@16.2.12` deps include
`typescript-eslint@^8.46.0`; `typescript-eslint@8.65.0` peers `typescript ">=4.8.4 <6.1.0"` (and every
`@typescript-eslint/*` subpackage repeats that range, none marked optional). `7.0.2` is outside it. **Pin 5.9.3 —
the recommendation stands.**

But:

**(a) `npm install` does NOT hard-error.** Real install, npm 11.16.0, node 24.18.0, defaults
(`strict-peer-deps=false`, `legacy-peer-deps=false`):

```
/tmp/ts4  devDeps {typescript:7.0.2, eslint:10.8.0, eslint-config-next:16.2.12}
$ npm install --no-audit --no-fund --ignore-scripts   ->  exit 0, 306 packages
   11x "npm warn ERESOLVE overriding peer dependency"
$ find node_modules -maxdepth 4 -type d -name typescript-eslint
   node_modules/eslint-config-next/node_modules/typescript-eslint
```

npm **nests** `typescript-eslint` under `eslint-config-next` and downgrades the conflict to a warning. It only
`ERESOLVE`-fails when `typescript-eslint` is a *direct* root dependency (verified: `/tmp/ts3` with
`{typescript:7.0.2, typescript-eslint:8.65.0}` → exit 1, `peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.65.0`),
or under `--strict-peer-deps`. In the §8.2 shape, `typescript-eslint` is transitive. So an agent that runs
`npm i -D typescript` gets a green install.

**(b) The lint stack does NOT break silently — it fails loudly.** With TS 7.0.2 installed, `eslint` aborts at
config-load time:

```
$ ./node_modules/.bin/eslint src/a.ts          # exit 2
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
    at .../eslint-config-next/node_modules/typescript-eslint/dist/index.js:52:11
```

typescript-eslint ships an explicit runtime guard. Also note `tsc --noEmit` under **7.0.2 exits 0** — TypeScript
itself is fine; only the ESLint integration is gated.

Rewrite the §5.2 warning as: *"`npm install` will succeed with ERESOLVE warnings and then every `npm run lint`
invocation will hard-fail with `typescript-eslint does not support TS 7.0`. Pin 5.9.3."* The old wording ("install
fails", "silently break") would send a debugger looking in the wrong place.

## VC-3 — NEW BLOCKING DEFECT in §8.2: `eslint: 10.8.0` produces a lint stack that cannot run.

Not caught by the original track. Measured end-to-end:

```
/tmp/ts5  {next:16.2.12, react:19.2.8, typescript:5.9.3, eslint:10.8.0, eslint-config-next:16.2.12}
eslint.config.mjs = [...(await import("eslint-config-next")).default]
$ ./node_modules/.bin/eslint src/a.tsx        # exit 2
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at resolveBasedir (.../eslint-plugin-react/lib/util/version.js:31:100)
```

Root cause (M): `eslint-config-next@16.2.12` depends on `eslint-plugin-react@^7.37.0`; `eslint-plugin-react@7.37.5`
(current `latest`) peers `eslint "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"`. ESLint 10 is outside that range and
removed the deprecated `context` shims the plugin calls. `npm install --strict-peer-deps` surfaces it directly:

```
npm error Conflicting peer dependency: eslint@9.39.5
npm error   peer eslint@"^2 || ... || ^9" from eslint-plugin-import@2.32.0
```

Downgrading to `eslint@9.39.5` fixes it completely — 0 ERESOLVE warnings on install, and lint runs clean with the
Next rules firing:

```
/tmp/ts6  same but eslint 9.39.5
$ ./node_modules/.bin/eslint src/a.tsx        # exit 0
  4:10  warning  Using `<img>` could result in slower LCP ...  @next/next/no-img-element
```

**Change §8.2 `"eslint": "10.8.0"` → `"eslint": "9.39.5"`.** (`eslint-config-next` itself peers `eslint >=9.0.0`, so
9.x is in range; the ESLint-10 incompatibility is in its own transitive plugins, not in the config package.) This
also blunts §8.5's cost note: on ESLint 9 the stack works today regardless of the TS ceiling.

## VC-4 — §3.3's redirect argument does not hold. The recommendation is still correct.

The conclusion — App Router, **no** `output: 'export'` — is right, and the unsupported-feature list in §3.3 is
verbatim-accurate (re-fetched; `Rewrites`, `Redirects`, `Headers`, `Proxy`, `ISR`, `Image Optimization with the
default loader`, `Draft Mode`, `Server Actions`, `Cookies`, `Intercepting Routes`, dynamic routes without
`generateStaticParams()`). The §3.2 quote about Server Components under export is also verbatim-accurate.

But the load-bearing example is wrong: **static export would not regress the apex→www redirect.**

- There is no `next.config.js` in the repo (`ls next.config*` → no matches) and no `vercel.json`, so the live 308
  (`curl -sI https://kevinweaver.dev` → `308`, `location: https://www.kevinweaver.dev/`, `server: Vercel`)
  **provably is not** a Next `redirects()` entry.
- Vercel applies it at the domain layer (Settings → Domains). Vercel's own docs: *"If someone visits your domain
  with or without the 'www' subdomain prefix, Vercel will attempt to redirect them to your domain"*
  (https://vercel.com/docs/domains/working-with-domains/add-a-domain). Domain-level redirects run before the
  deployment output is served and are unaffected by `output`.

The surviving arguments against export are the ones §3.3 lists second and third — `headers` for CSP/caching on the
JSON data files, and default-loader optimization of the two remote GitHub avatars — plus §3.3's own (I) that export
buys nothing on Vercel. Keep the recommendation; drop the redirect as its justification, and delete the
"incompatible with `output: 'export'`" clause from open question 5, which rests on the same mistake.

## VC-5 — §8.5 / §9 step 4 CONFIRMED, and stronger than stated.

- `next lint` removed: confirmed in the release notes table verbatim (*"`next lint` command | Use Biome or ESLint
  directly; `next build` no longer runs linting."*) **and empirically** — `./node_modules/.bin/next --help` on
  16.2.12 lists `build, experimental-analyze, dev, info, start, telemetry, typegen, upgrade, experimental-test,
  internal`. No `lint`. `next lint` is parsed as a *directory* argument: `Invalid project directory provided, no
  such directory: /tmp/ts6/lint`.
- No CI: `ls .github` → **`No such file or directory`**. Not just `workflows/` — the whole directory is absent.
- Bonus for the step-4 ticket: 16.2.12 ships **`next typegen`** ("Generate TypeScript definitions for routes,
  pages, and layouts without running a full build"). Run it before `tsc --noEmit` in CI or typed-route checks fail.

## VC-6 — §7.3's `localFont` snippet is wrong: `src` entries cannot carry `unicode-range`.

`tokens/fonts.css` was re-fetched from DesignSync and §7.1 is verbatim-accurate — 12 `@font-face` rules, roman
`font-weight:300 800` across 6 subsets, italic `400` across the same 6, every rule `font-display:swap` with a
precise `unicode-range`. The 12 `assets/fonts/*.woff2` exist in the project (`DesignSync list_files`).

But (M, https://nextjs.org/docs/app/api-reference/components/font): `src` is typed
`Array<{path: string, weight?: string, style?: string}>`. **There is no per-entry `unicode-range`.** The §7.3
snippet declares `latin` and `latin-ext` as two entries with identical `weight:"300 800"` / `style:"normal"`, so
Next emits two `@font-face` rules that are indistinguishable to the font-matching algorithm — the browser picks one
and the other is dead weight (and both get `<link rel=preload>`d). `declarations` sets descriptors for the whole
loader, not per `src` entry.

Fix: either ship **`latin` only** (one roman + one italic entry — correct for English resume text plus GitHub
repo/file names, which is exactly §7.3's own stated rationale for dropping 8 of 12), or hand-author the
`@font-face` rules from `tokens/fonts.css` with their `unicode-range`s intact and skip `next/font/local`. The
§7.3 conclusion (local over google) and the two ⚠️ notes are otherwise confirmed verbatim: `src` paths are
*"relative to the directory where the font loader function is called"*, and `adjustFontFallback` for local fonts is
*"`'Arial'`, `'Times New Roman'` or `false`. The default is `'Arial'`."*

## VC-7 — §4.3 `@theme inline` CONFIRMED, and now empirically, not just from docs.

Compiled both forms with the real `tailwindcss@4.3.3` CLI against identical input
(`:root{--aqua:#8ec07c;--red:#fb4934;--accent:var(--aqua)}`):

```css
/* @theme        */  @layer utilities { .text-accent { color: var(--color-accent) } }
/* @theme inline */  @layer utilities { .text-accent { color: var(--accent)       } }
```

Plain `@theme` freezes the lookup at `:root`, so `<section style={{"--accent":"var(--red)"}}>` cannot re-point it.
`inline` emits the live reference and it can. §4.3's reasoning is exactly right, and the Tailwind docs' own
worked example is the identical nested-scope case. Note one detail the doc implies otherwise: under `inline` the
theme variable `--color-accent: var(--accent)` is **still emitted** into `@layer theme :root` in 4.3.3 — `inline`
changes what the *utility* references, not whether the variable is declared. Harmless, but don't use its absence
as a verification signal. Everything else in §4.1 re-verified verbatim: `postcss-import`/`autoprefixer` removal,
`corePlugins`/`safelist`/`separator` unsupported in a v4 JS config, JS configs no longer auto-detected, and the
Chrome 111 / Safari 16.4 / **Firefox 128** floor.

## VC-8 — Minor: several §2.1 line counts are approximations presented as measurements.

`wc -l` actuals vs the doc: `pages/index.js` **17** (doc: 20), `styles/globals.scss` **22** (doc: 20),
`postcss.config.js` **8** (doc: 6), `components/HomeHero.js` **167** (doc: "~150", hedged). `pages/_app.js` 7 ✓.
Everything substantive in §2.1–§2.4 re-verified: `git ls-files | wc -l` → 34; no `next.config*`; `package.json`
name `"with-tailwindcss"` with `"next": "latest"`; lockfile pins `10.1.3`; `tailwind.config.js` is the stock
v2 `purge`/`darkMode:false`/`variants` default; both lockfiles present at `12:42`; no `.nvmrc`/`.node-version`/`.npmrc`.
§2.2 fully confirmed: `HomeHero.js:154` is `style="m-4"`; `@keyframes flow` is nested inside `.gradient` (l.103) and
`@keyframes bounce` inside `.bounce` (l.136); `text-fill-color:transparent` (l.100) with the `-webkit-` form
commented out (l.101); `background: url(images/background.png)` with no leading slash (l.46); the 8 gradient stops
match. One nit: `WriteCode` is commented out in JSX but **still imported** at `pages/index.js:3`, so it is still in
the bundle today — §9 step 2 already handles this.

Two more §0.x nits: the §0.4 quote of `kevinweaver.dev.dc.html:48` silently drops `position:relative;`, and §4.3's
`--leading-body: 1.55` comes from the comp's inline `line-height`, not from the DS token, which is
`--lh-body:1.5`. §0.3 is exactly right — all 26 base values and the full semantic alias layer match `tokens/colors.css`
verbatim, including the header comment *"`--accent` / `--accent-d` are re-pointed per slide or per section, inline."*
