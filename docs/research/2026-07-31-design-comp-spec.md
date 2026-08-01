# Design comp implementation spec — `kevinweaver.dev.dc.html`

Date: 2026-07-31. Track: DESIGN.
Source of truth: `/home/everdred/github/everdred/kevinweaver-dev/docs/design/kevinweaver.dev.dc.html`
(60,626 bytes, 1,033 lines, read in full).

**(M)** = measured (command / file:line quoted). **(I)** = inference.

---

## 0. Status of the design-system files on disk

**(M)** Both DS directories existed but were **empty**:

```
find docs/design/_ds -type f   →  (no output)
```

`docs/design/_ds/swe-rts-terminal-design-system-583945d5-.../{layers,tokens}/` were
zero-file directories. `support.js` and `_ds_bundle.js` do not exist anywhere in the repo.
So every `<link>` in the comp's `<helmet>` (comp:11-21) was a dead reference and the comp
would have rendered completely unstyled if opened locally.

**(M)** I fetched the DS through the `DesignSync` tool (read-only methods, project
`583945d5-2203-4320-8a4e-b30afe61181d`, name "SWE·RTS Terminal Design System", owned by Kevin).
`DesignSync list_files` returns 130 paths. The 10 files the comp needs, all fetched and
verified non-truncated:

| Path | Fetched | Notes |
|---|---|---|
| `tokens/colors.css` | ✅ | gruvbox base + semantic aliases |
| `tokens/typography.css` | ✅ | **the 1920×1080 slide scale** |
| `tokens/spacing.css` | ✅ | slide-scale geometry |
| `tokens/effects.css` | ✅ | **all the motion tokens** |
| `tokens/fonts.css` | ✅ | 12 `@font-face`, JetBrains Mono woff2 subsets |
| `layers/base.css` | ✅ | reset, `.slide`, scanline, `a`, `.reveal` |
| `layers/type.css` | ✅ | `.rainbow .hl .uhl .kicker .cursor .ln-cell` |
| `layers/pane.css` | ✅ | `.pane .pane-bar .dots .pane-title .pane-body .ph` |
| `layers/tmux.css` | ✅ | `.tmux .seg .pl .plr .session .clock` |
| `layers/data.css` | ✅ | `.commit .graph .hash .ref .cyear .cmsg .rail .meter` |

**Still not fetched** (not needed to port, listed for completeness): `_ds_bundle.js`,
`templates/terminal-deck/support.js`, `templates/terminal-deck/deck-stage.js`,
`ui_kits/state-of-swe-deck/deck-stage.js`, the 12 `assets/fonts/*.woff2` binaries, the 14
`assets/deck-imagery/*.png`, and the 20 `guidelines/*.card.html` reference cards.

**Action for the port:** do **not** re-vendor `_ds_bundle.js` / `support.js` — those are the
`<x-dc>` design-comp runtime (custom elements `<x-dc>`, `<helmet>`, `<sc-if>`, and the
`{{ ref }}` / `{{ onClick }}` binding syntax). The comp's `class Component extends DCLogic`
is a React class component in disguise; port it to real React and drop the runtime entirely.

**Do fetch the 12 woff2 binaries**, or use `@fontsource/jetbrains-mono@5.3.0` (**M**:
`npm view @fontsource/jetbrains-mono version license` → `5.3.0`, `OFL-1.1`). The DS's
`tokens/fonts.css` declares `font-weight:300 800` variable ranges across 6 latin/cyrillic/
greek/vietnamese subsets plus 6 italic-400 subsets. **The site only needs `latin` +
`latin-ext`, roman only** — the comp uses zero italics for text (`<em>` at comp:62 is reset
to `font-style:normal`) and zero non-latin. That is 2 files, not 12. (**I**)

**(M)** JetBrains Mono Nerd Font is installed on this dev machine (`fc-list | grep -i
jetbrains` → 5+ hits) — do **not** rely on that; local dev will silently look right while
production tofus.

**(M)** `layers/tmux.css` header comment says exactly why: *"Powerline-style angled
separators are drawn with CSS clip-path triangles, not U+E0B0 glyphs — Google-hosted
JetBrains Mono ships no Nerd Font PUA range, so a glyph separator would render as tofu."*
Keep the clip-path approach.

---

## 1. What the comp actually consumes from the DS (surface is small)

**(M)** Class-usage census over the comp (`grep -oE 'class="[^"]*"' | tr ' ' '\n' | sort | uniq -c`):

```
7 pane        6 pane-bar     6 pane-body    6 pane-title   6 seg
5 commit      5 cmsg         5 cyear        5 graph        5 hash
4 rail        3 plr          2 pl           2 dots         2 focus
2 kw-hide-sm  1 tmux         1 spacer       1 session      1 clock
1 kw-2up  1 kw-graph  1 kw-instr  1 kw-lower  1 kw-pad  1 kw-tail
```

**(M)** Every other DS class is used **zero** times (`/tmp/audit.sh`, verbatim output):

```
reveal=0 rainbow=0 hl=0 mark=0 uhl=0 accent=0 dim=0 gray=0 kicker=0
prompt=0 cursor=0 ln-cell=0 metric=0 meter=0 ph=0 logo-tile=0
slide=0 glow=0 wins=0 win=0 host=0 chev=0 bleed=0 ref=0 anim=0
```

**This is the single most useful finding for scoping.** The comp uses **none** of the DS's
type layer, none of its animation layer, none of its meter/metric layer, and none of its
`.slide` shell. The port needs to ship exactly 19 DS classes, not the whole system.

Consequences:

- **`--dur-reveal`, `--dur-meter`, `--dur-rainbow`, `--dur-blink`, `--stagger`, `--ease-out`
  are all unreferenced by the comp.** (**M**: `grep -nE 'dur-reveal|dur-meter|dur-rainbow|
  dur-blink|stagger|ease-out|reveal|rainbow' kevinweaver.dev.dc.html` → one hit, and it is
  `var(--scanline)` on comp:50.) They exist in `tokens/effects.css`; nothing in the comp
  animates with them. Any reveal/stagger/blink/rainbow in the shipped site is **new design
  work**, not a port.
- **(M)** The comp defines only two of its own keyframes (comp:30-31) and uses them twice:
  ```css
  @keyframes kw-pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
  @keyframes kw-logIn{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}
  ```
  `animation:kw-logIn .3s ease both` (comp:443, boot lines), `animation:kw-logIn .25s ease both`
  (comp:933, event log lines), `kw-pulse 1.1s steps(1) infinite` (comp:966, live dot).
- **(M)** `grep -c transition` → **0**. There is not one CSS transition in the comp. Every
  moving pixel is either a canvas rAF redraw or one of those two keyframes.

### 1.1 The DS token values the comp actually resolves against

`tokens/typography.css` (**M**, verbatim):
```
--fs-stat:240px; --fs-hero:200px; --fs-h1:108px; --fs-h2:72px; --fs-h3:52px;
--fs-lead:40px;  --fs-body:30px;  --fs-mono:28px; --fs-small:24px; --fs-micro:24px;
--fw-light:300 --fw-regular:400 --fw-medium:500 --fw-semibold:600 --fw-bold:700 --fw-black:800
--lh-tight:.9 --lh-heading:1.04 --lh-body:1.5 --lh-code:1.6
--ls-display:-.02em --ls-heading:-.01em --ls-caps:.16em
--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace
```
Header comment (**M**): *"Sizes are authored against the 1920x1080 slide canvas — deck-stage
scales the whole slide, so never re-tune per viewport."* That instruction is **void** for a
website; see §5.

`tokens/spacing.css` (**M**): `--sp-1:6 --sp-2:14 --sp-3:18 --sp-4:26 --sp-5:34 --sp-6:46
--sp-7:64 --sp-8:88 --sp-9:104`; `--pane-gap:18px --pane-pad:28px 34px --bar-h:46px
--tmux-h:48px --r-pane:8px --r-chip:4px --r-ph:6px --bw-pane:2px --bw-hard:2px`.

`tokens/effects.css` (**M**): `--shadow-focus:0 0 0 1px var(--accent),0 24px 60px -20px
rgba(0,0,0,.6)`; `--shadow-inset-track:inset 0 0 0 1px rgba(0,0,0,.25)`;
`--scanline:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)`;
`--scanline-opacity:.35`; `--glow-blur:110px`; `--glow-opacity:.16`;
`--ease-out:cubic-bezier(.2,.7,.2,1)`; `--dur-reveal:.9s`; `--dur-meter:1.1s`;
`--dur-rainbow:18s`; `--dur-blink:1.1s`; `--stagger:.06s`; `--pl-w:26px`.

`tokens/colors.css` semantic aliases (**M**) — these matter because `.pane` etc. reference
the alias, not the raw colour:
```
--surface-deck:#0f1011  --surface-slide:var(--bg0)  --surface-pane:var(--bg-h)
--surface-bar:var(--bg1)  --surface-raised:var(--bg2)
--text-strong:fg0 --text-body:fg1 --text-muted:fg2 --text-dim:fg3 --text-faint:fg4 --text-comment:gray
--border-pane:bg2  --border-hard:bg-h  --border-dashed:bg3
--accent:var(--aqua)  --accent-d:var(--aqua-d)
--status-ok:green --status-warn:yellow --status-bad:red
--diff-add:green --diff-del:red --diff-mod:yellow
```

**Load-bearing consequence (M):** `.pane{background:var(--surface-pane)}` = `--bg-h`
= `#1d2021`. **Almost every pixel of text in the comp sits on `#1d2021`, not on `#282828`.**
The `--bg0` field only shows through the 14px gutters between panes. All contrast maths in
§8 is against `#1d2021` unless stated.

### 1.2 The comp's own token overrides

**(M)** comp:48 — a single root `<div>` re-points the whole scale inline:
```
--bar-h:32px; --fs-micro:11px; --fs-small:12px; --fs-mono:13px; --fs-body:14px;
--fs-lead:17px; --fs-h3:22px; --pane-pad:16px 18px; --pane-gap:14px; --tmux-h:40px;
--accent:var(--aqua); --accent-d:var(--aqua-d);
font-family:var(--mono); background:var(--bg0); color:var(--fg1);
min-height:100vh; position:relative; font-size:13px; line-height:1.55;
-webkit-font-smoothing:antialiased
```

The comp author **already did a slide→web re-derivation**, as fixed px, at a ratio of
~0.42–0.50 (**M**: micro 11/24=.458, small 12/24=.500, mono 13/28=.464, body 14/30=.467,
lead 17/40=.425, h3 22/52=.423).

Three landmines in that line (**M**):

1. **`--fs-h1`, `--fs-h2`, `--fs-hero`, `--fs-stat` are NOT overridden.** Any element the
   port styles with `var(--fs-h1)` inherits **108px**; `var(--fs-hero)` inherits **200px**.
   The comp gets away with it only because it contains zero heading elements (§8).
2. **`--tmux-h:40px` is dead.** `.tmux{height:var(--tmux-h)}` (tmux.css) is beaten by the
   inline `height:24px` on comp:173. The bar is 24px, not 40px.
3. **`--pl-w` is set to `12px` inline on comp:173**, overriding the DS's `26px`. The comp
   then patches the arrow geometry with two rules at comp:28-29 to kill the 1px seam:
   ```css
   .tmux .seg.pl::after{left:calc(100% - 1px);width:calc(var(--pl-w) + 1.5px);}
   .tmux .seg.plr::before{right:calc(100% - 1px);width:calc(var(--pl-w) + 1.5px);}
   ```
   **Fold this into `layers/tmux.css`** in the port — it is a genuine bug fix, not a comp
   hack, and it will bite again at any `--pl-w`.

`font-size:13px` on the root is an absolute px root size — see §8, it breaks browser
font-size preference.

---

## 2. Every section, in document order

Nesting: `<x-dc>` → `<helmet>` (head injection) → root `<div>` (comp:48) → 4 children +
`<sc-if>` overlay. Root is `position:relative; min-height:100vh; background:var(--bg0)`.

### 2.0 `<helmet>` — comp:10-47
Not a rendered section. 11 stylesheet links + 1 script + one `<style>` block containing:
page reset (`html,body{margin:0;padding:0;background:#282828}`), `::selection{background:
#8ec07c;color:#1d2021}`, webkit scrollbar (10px, track `#1d2021`, thumb `#504945` r5), the
two `--pl-w` seam patches, the two `@keyframes`, and the **two media queries** (§7).
**Port target:** `pages/_document.js` head + a global `styles/kw.css`. The scrollbar rules
are `::-webkit-scrollbar` only — add `scrollbar-color:#504945 #1d2021` for Firefox. (**I**)

### 2.1 Scanline overlay — comp:50
```html
<div style="position:fixed;inset:0;pointer-events:none;z-index:80;
            background:var(--scanline);opacity:.35;mix-blend-mode:multiply"></div>
```
Semantic purpose: CRT texture. Purely decorative. `position:fixed` + `z-index:80` puts it
**above every pane and above the tmux bar (z 70), below the boot overlay (z 90)**.
No text content. Duplicates `--scanline-opacity:.35` as a literal.
**React:** `<Scanline />`, zero props. Must be `aria-hidden="true"` (it currently is not,
though a childless div is harmless). **Must be gated on `prefers-reduced-motion`? No — it
does not move.** But it *does* cost contrast (§8.3) and should be user-dismissible. (**I**)

### 2.2 `<header>` — comp:52-64 — sticky top chrome
`position:sticky;top:0;z-index:70;height:32px;display:flex;align-items:stretch;padding:0 10px;
background:var(--bg-h);border-bottom:1px solid var(--bg1);font-size:11px;letter-spacing:.02em;
white-space:nowrap`

| Child | Literal text | Styling |
|---|---|---|
| brand `<span>` | `kevinweaver.dev` | `padding:0 10px 0 4px;color:var(--fg1);font-weight:800` |
| `<nav ref={navRef}>` `.kw-hide-sm` | 3 `<a>` | `display:flex;align-items:stretch;gap:2px` |
| ↳ `<a href="#whoami" data-sec="whoami">` | `<i>1</i>` + `whoami` | `padding:0 9px;margin:4px 0;border-radius:4px;color:var(--fg4);border:none;font-weight:600;gap:6px`; `<i>` is `opacity:.55` |
| ↳ `<a href="#arc" data-sec="arc">` | `<i>2</i>` + `arc` | same |
| ↳ `<a href="#contact" data-sec="contact">` | `<i>3</i>` + `contact` | same |
| spacer `<span>` | — | `flex:1` |
| `<span ref={pillRef}>` | — | `gap:7px;padding:0 10px;color:var(--fg3);font-weight:700;font-size:10px;letter-spacing:.1em;text-transform:uppercase` |
| ↳ `<i ref={pillDotRef}>` | — | `7×7px;border-radius:50%;background:var(--green)` |
| ↳ `<em ref={pillTextRef}>` | `live` | `font-style:normal` |

Notes: `border:none` on the links deliberately kills `base.css`'s
`a{border-bottom:1px solid color-mix(...)}`, so **the nav links have no non-colour
affordance at all** (§8.2). The `<i>1</i>` numerals are a waybar/i3 workspace idiom — they
are *not* keyboard shortcuts; **no keydown handler binds 1/2/3** (**M**: the only `keydown`
listener, comp:477-491, handles `Space`, arrows, and `x`).

Placeholder that needs real content: none. But **`kevinweaver.dev` should be an `<a href="/">`**
and the whole header should be `<header role="banner">` with `<nav aria-label="sections">`.

### 2.3 `<main>` — comp:66 — `.kw-pad`
`max-width:1560px;margin:0 auto;padding:14px;display:flex;flex-direction:column;gap:14px`.
1560px matches `data-props.$preview.width` exactly (**M**: `{"$preview":{"width":1560,
"height":1300}}`, comp:193).

### 2.4 `<section class="kw-instr">` — comp:68-125 — the instrument panel
`height:calc(100vh - 60px);min-height:520px;display:flex;flex-direction:column;gap:14px`.
**(M)** `60 = 32 (header) + 14 + 14 (main padding)` — exact, so the section is a true
"first viewport" pane. Contains 2.4.1 and 2.4.2.

#### 2.4.1 `.pane` "contributions" — comp:69-87 — `flex:0 0 auto`
- `.pane-bar` → `.dots` (3 `<i>`) + `.pane-title` **`contributions`**
- `.pane-body` `display:flex;flex-direction:column;gap:9px;padding:14px 16px` (overrides
  `--pane-pad`)
  - **Block A** `position:relative`
    - `<canvas ref={overRef} style="display:block;width:100%;height:50px;cursor:ew-resize">`
    - caption row `display:flex;justify-content:space-between;margin-top:3px;font-size:10px;
      color:var(--gray);letter-spacing:.09em;text-transform:uppercase`
      - left: **`now → 2021 · drag to scrub`**
      - right (`color:var(--purple)`): **`◆ 29 jan 2026 · agent initialized`**
  - **Block B** `position:relative;height:140px`
    - `<canvas ref={ribbonRef} style="display:block;width:100%;height:100%">`
    - `<div ref={tipRef}>` tooltip: `position:absolute;display:none;pointer-events:none;
      z-index:5;background:var(--bg-h);border:2px solid var(--bg2);border-radius:4px;
      padding:8px 10px;font-size:11px;line-height:1.5;white-space:nowrap;
      box-shadow:0 12px 30px -12px rgba(0,0,0,.8)`

Total measured height: `32 (bar) + 14 + 50 + 3 + ~12 + 9 + 140 + 14 = 274px`.

#### 2.4.2 `.kw-lower` — comp:89-124 — `flex:1;min-height:0;display:flex;gap:14px`

**Left: `.pane.focus` "gource — repo graph"** — `flex:1;min-width:0`
- `.pane-bar`: `.pane-title` **`gource — repo graph`** (`padding-left:2px`) + spacer +
  `<span ref={graphDateRef} style="color:var(--aqua);font-weight:700;
  font-variant-numeric:tabular-nums">` literal **`01 aug 2021`**
- `.kw-graph` `position:relative;flex:1;min-height:0;background:var(--bg-h)`
  - `<canvas ref={graphRef}>` 100%×100%
  - legend `position:absolute;left:12px;bottom:10px;display:flex;gap:13px;font-size:10px;
    color:var(--fg4);letter-spacing:.05em;background:rgba(29,32,33,.8);padding:5px 9px;
    border-radius:4px` — 4 items, each a 14×2px `<i>` swatch + label:
    **`commit`** aqua · **`pr`** purple · **`issue`** yellow · **`review`** blue
- transport bar `flex:0 0 auto;height:38px;display:flex;align-items:center;gap:12px;
  padding:0 14px;background:var(--bg1);border-top:2px solid var(--bg-h);font-size:11px`
  - `<button onClick={onToggle} ref={playRef}>` **`⏸`** — `font-family:var(--mono);
    font-size:11px;font-weight:800;width:26px;height:22px;background:var(--aqua);
    color:var(--bg-h);border:none;border-radius:3px;cursor:pointer`
  - seek track `<div onClick={onSeek}>` `flex:1;height:8px;background:var(--bg-h);
    border-radius:4px;cursor:pointer;position:relative;box-shadow:var(--shadow-inset-track)`
    - `<div ref={seekFillRef}>` `position:absolute;inset:0 auto 0 0;width:0%;
      background:linear-gradient(90deg,var(--aqua-d),var(--aqua));border-radius:4px`
    - `<div ref={seekBirthRef}>` `position:absolute;top:-3px;width:2px;height:14px;
      background:var(--purple);left:0%` (JS sets `left` = `birthIdx/N*100%`)
  - `<span onClick={onJumpStart} style="color:var(--fg4)">` **`⏮ 2021`**
  - `<span onClick={onJumpBirth} style="color:var(--purple)">` **`◆ init`**
  - `<span onClick={onJumpLive} style="color:var(--aqua)">` **`⏭ live`**
  - `<span onClick={onSpeed} ref={speedRef} style="color:var(--fg3);font-weight:700;
    min-width:82px;text-align:right">` **`12 days/sec`**

**Right: `.pane.kw-tail` "events — tail -f"** — `flex:0 0 320px;width:320px;min-width:0`
- `.pane-bar`: `.pane-title` **`events — tail -f`**
- `.pane-body ref={logRef}` `padding:4px 14px 12px;font-size:11px;line-height:1.8;
  display:flex;flex-direction:column;gap:1px;justify-content:flex-end;overflow:hidden;
  min-height:0` — **empty in markup**, filled entirely by `pushLog()`.

### 2.5 `.kw-2up#whoami` — comp:127-160
`display:grid;grid-template-columns:1fr 2fr;gap:14px;scroll-margin-top:44px`
(44 = 32 header + 12 breathing room).

#### 2.5.1 `.pane` "man kevin-weaver" — comp:128-145 (left, 1fr)
`.pane-body` `display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.7`.
Three blocks, each = a label `<div>` (`color:var(--fg4);font-weight:800;letter-spacing:.14em;
font-size:11px;margin-bottom:6px`) + one or more `<p style="margin:0">`.

| Label | Literal body |
|---|---|
| `NAME` | `kevin weaver — ethereum infrastructure, developer tooling, agent runtimes` (`color:var(--fg1)`) |
| `DESCRIPTION` | p1 (`color:var(--fg2);text-wrap:pretty;margin:0 0 10px`): `the layer nobody demos: compilers, test pipelines, deploy stacks, docs sites. truffle's box templates and release tooling. 0xmetropolis' onchain deploy stack and subgraph. the front end of ethereum.org and the ethereum foundation site.` <br> p2: `now `+`<span style="color:var(--aqua)">aiur</span>`+` — an elixir runtime for agents that stay alive between sessions. most of its commits are not mine.` |
| `SEE ALSO` | `elixir · otp · solidity · foundry · typescript · graphql · subgraphs · ci/cd · agent orchestration` (`color:var(--fg3)`) |

**ALL OF THIS IS PLACEHOLDER AND CONTRADICTS THE AUTHORITATIVE RESUME.** No `SYNOPSIS`,
no `OPTIONS`. See §6.

#### 2.5.2 `.pane#arc` "git log" — comp:146-159 (right, 2fr)
`.pane-bar`: `.pane-title` **`git log --graph --oneline --since=2021`** + spacer +
`<span style="color:var(--fg4)" class="kw-hide-sm">` **`HEAD → main`**.
`.pane-body` `display:flex;flex-direction:column;font-size:13px`.
5 `.commit` rows interleaved with 4 `.rail` divs. Each row (comp overrides `.hash` to
`flex:0 0 92px` and `.cyear` to `flex:0 0 88px`):

| # | graph ● | hash | cyear | cmsg (bold span + em-dash tail) |
|---|---|---|---|---|
| 1 | purple | `a11ce55` purple | `2026` | **`its-applekid initialized`** (fg0, 700) — `1,486 contributions in five months, 603 of them pull requests` |
| 2 | default | `5eed128` aqua | `2025–26` | **`aiur · etherguild · agent tooling`** (fg1, 700) — `elixir runtime, guild site, skills` |
| 3 | default | `0xc0de1` blue | `2023–24` | **`ethereum foundation web properties`** — `ethereum.org front end, ef site` |
| 4 | default | `c0ffee2` orange | `2022–23` | **`0xmetropolis`** — `metal, contracts, subgraph, metro-sdk` |
| 5 | default | `7ea1eaf` yellow | `2021–22` | **`consensys · truffle`** — `truffle core, box templates, trufflesuite.com` |

**(M) Bug:** `0xc0de1` contains `x`, which is not a hex digit. A "git hash" must match
`[0-9a-f]{7}`. Also **ALL FIVE ROWS ARE PLACEHOLDER** — there is no Optimism, no Stitch Fix,
no EMS Heroes, no Omni Developers, no Rowan University. See §6.

### 2.6 `.pane#contact` — comp:162-170
`border-color:var(--bg1)` (overrides `--border-pane:bg2` — a *softer* border, the only
non-focus border variation in the comp). No `.pane-bar`. `.pane-body` `display:flex;
align-items:center;gap:12px;padding:16px 18px`.
- label `<span>` **`reach me`** — `font-size:11px;color:var(--gray);letter-spacing:.1em;
  text-transform:uppercase;margin-right:6px`
- 4 `<a>` tiles, each `width:34px;height:34px;border:2px solid var(--bg2);border-radius:6px;
  display:flex;align-items:center;justify-content:center;font-weight:800`:

| glyph | href | title | colour / size |
|---|---|---|---|
| `gh` | `https://github.com/its-everdred` | `github.com/its-everdred` | `--aqua`, 12px |
| `◆` | `https://github.com/its-applekid` | `github.com/its-applekid` | `--purple`, 12px |
| `✉` | **`#contact`** (dead) | **`kevin@kevinweaver.dev`** | `--fg3`, 14px |
| `@` | **`#contact`** (dead) | **`@its_everdred`** | `--fg3`, 13px |

**(M) Two wrong facts vs the authoritative resume:** email is `notkevinweaver@gmail`, not
`kevin@kevinweaver.dev`; Twitter is `@kevin_weaver`, not `@its_everdred`. Both `href`s are
placeholders pointing at `#contact`. Missing entirely: LinkedIn `kevinweaver`, web
`kevinmweaver.com`, phone `<redacted-personal-phone>`.

### 2.7 `.tmux` status bar — comp:173-181
`position:sticky;bottom:0;z-index:70;height:24px;font-size:11px;font-weight:600;
letter-spacing:.01em;--pl-w:12px`. Six segments:

| class | literal | style |
|---|---|---|
| `seg session pl` | `NORMAL` | `padding:0 9px 0 10px;font-weight:800` (DS gives it `background:var(--accent)`, `color:var(--bg-h)`) |
| `seg pl` | ` main` (leading space, Nerd-Font branch glyph is *absent* — see below) | `background:var(--bg3);color:var(--fg1);padding:0 9px 0 16px` |
| `seg` | `kevinweaver.dev` | `padding:0 10px 0 16px;color:var(--fg3)` |
| `spacer` | — | `flex:1 1 auto` |
| `seg plr ref=barPosRef` | `☰ 1826/1826` | `background:var(--bg2);color:var(--fg3);font-variant-numeric:tabular-nums` |
| `seg plr ref=barPctRef` | `100%` | `background:var(--bg3);color:var(--fg1);tabular-nums` |
| `seg clock plr ref=barClockRef` | `09:41` | `padding:0 10px 0 16px;font-weight:800` (DS: `background:var(--accent)`) |

**(M)** `1826` is exact: `Date.UTC(2026,6,31) - Date.UTC(2021,7,1)` = 1825 days, `+1` = 1826
(comp:274). The literal in markup and the computed `this.N` agree.
**(M)** The comp uses `.seg .pl .plr .session .clock .spacer` but **not** `.wins .win .host
.chev` — so `TmuxBar.jsx`'s `windows` prop model does not fit; the port needs a
free-segment API (§3.6).

### 2.8 `<sc-if value={booting}>` boot overlay — comp:183-190
`position:fixed;inset:0;z-index:90;background:var(--bg0);display:flex;align-items:center;
justify-content:center;padding:24px;cursor:pointer` with `onClick={onSkipBoot}`.
- `.pane.focus` `width:min(680px,100%)`
- `.pane-bar` → `.dots` + `.pane-title` **`kevinweaver.dev — cold start`**
- `.pane-body ref={bootRef}` `min-height:210px;font-size:12px;line-height:1.9;
  display:flex;flex-direction:column;gap:1px` — empty in markup.

**(M)** Default-off: `this.state.booting = !this.rm && (p.startState || 'idle') === 'boot'`
(comp:206) and `startState` defaults to `'idle'` (comp:193 props JSON). So **the boot
sequence does not run unless explicitly enabled**, and never runs under reduced motion.

### 2.9 Component props panel — comp:193 `data-props`
**(M)** decoded:
```json
{"$preview":{"width":1560,"height":1300},
 "startState":{"editor":"enum","options":["idle","boot","live"],"default":"idle",
               "tsType":"'idle'|'boot'|'live'","section":"States"},
 "agentEncoding":{"editor":"enum","options":["band","none"],"default":"band",
                  "tsType":"'band'|'none'","section":"Colour system"},
 "speed":{"editor":"range","default":12,"min":4,"max":32,"step":4,"unit":" days/s",
          "tsType":"number","section":"States"}}
```
`agentEncoding:'band'` is the mechanism that satisfies the product rule *"their
contributions are COMBINED in the contribution-grid squares"* while still distinguishing the
two actors: one square, one level (from the **combined** total), with a bottom band whose
height = `day.g / day.t` painted in the pink `AG` ramp (comp:548-552, 604-609). Keep it.

---

## 3. Design-system component catalogue → React

All CSS below is **verbatim (M)** from the fetched DS files.

### 3.1 `.pane` — `layers/pane.css`
```css
.pane{border:var(--bw-pane) solid var(--border-pane);border-radius:var(--r-pane);
      overflow:hidden;background:var(--surface-pane);display:flex;flex-direction:column;}
.pane.focus{border-color:var(--accent);box-shadow:var(--shadow-focus);}
```
Anatomy: 2px `#504945` border, 8px radius, `#1d2021` fill, column flex, `overflow:hidden`
(so canvases can't escape). `.focus` swaps the border to `--accent` and adds
`0 0 0 1px accent, 0 24px 60px -20px rgba(0,0,0,.6)` — a ring + a deep drop.
**At most one focused pane per view** (DS comment). The comp has two (`gource` pane and the
boot overlay) but they are never on screen together — boot is `position:fixed` full-cover.

An upstream `Pane.jsx` already exists (**M**, `components/chrome/Pane.jsx`):
```
Pane({ title, dots=false, titleColor, right, focus=false, bleed=false,
       bodyStyle, style, className='', children })
```
It auto-renders `<PaneBar>` when `title != null || dots || right != null`.
**Gap for this site:** the comp needs the pane body to be a *flex child that can shrink*
(`flex:1;min-height:0`) and needs a **third slot below the body** (the 38px transport bar,
comp:105). Extend to:
```ts
type PaneProps = {
  title?: ReactNode; dots?: boolean; titleColor?: string;
  right?: ReactNode;            // right-aligned pane-bar slot (graphDate, "HEAD → main")
  focus?: boolean; bleed?: boolean;          // bleed → .pane-body.bleed (padding:0)
  footer?: ReactNode;                        // NEW: renders after .pane-body
  as?: 'div'|'section'|'article';            // NEW: semantics (§8.4)
  labelledBy?: string;                       // NEW: id of the pane-title for aria
  bodyRef?: Ref<HTMLDivElement>;             // NEW: logRef / bootRef need it
  id?: string; className?: string; style?; bodyStyle?; children;
};
```

### 3.2 `.pane-bar` / `.dots` / `.pane-title`
```css
.pane-bar{flex:0 0 auto;height:var(--bar-h);display:flex;align-items:center;gap:14px;
  padding:0 18px;background:var(--surface-bar);border-bottom:var(--bw-hard) solid
  var(--border-hard);font-size:var(--fs-micro);color:var(--text-faint);
  white-space:nowrap;overflow:hidden;}
.dots{display:flex;gap:9px;}
.dots i{width:14px;height:14px;border-radius:50%;display:block;}
.dots i:nth-child(1){background:var(--red);}   /* #fb4934 */
.dots i:nth-child(2){background:var(--yellow);} /* #fabd2d */
.dots i:nth-child(3){background:var(--green);}  /* #b8bb26 */
.pane-title{color:var(--text-dim);font-weight:var(--fw-semibold);}
```
**(M) Slide-scale leak:** `.dots i` is **14px** and `.dots{gap:9px}` — that is 60px of
traffic lights inside a **32px** bar (comp's `--bar-h:32px`). The bar is `align-items:center`
so they will not clip vertically, but they are visually enormous at web scale.
**Re-derive: `--dot-size: clamp(7px, .55rem, 9px)` and `gap: clamp(5px,.4rem,6px)`.**
Similarly `.pane-bar{gap:14px;padding:0 18px}` is slide-scale; the comp partially fixes this
by adding `padding-left:2px` inline to `.pane-title` when there are no dots (comp:92, 120,
129, 147) — **that inline hack disappears once `--pane-bar-pad` is tokenised.** (**I**)

React: `PaneBar({ title, dots, titleColor, right, children, style })` — upstream version is
fine, but its `right` slot hardcodes `className="gray"` + `fontSize:var(--fs-micro)`
(**M**, `PaneBar.jsx`), while the comp's right slots are aqua/tabular-nums and fg4.
Make `right` a raw `ReactNode` with no wrapper styling.

### 3.3 `.pane-body`
```css
.pane-body{flex:1 1 auto;min-height:0;padding:var(--pane-pad);overflow:hidden;}
.pane-body.bleed{padding:0;}
```
`min-height:0` is what makes the whole `100vh` instrument layout work. Don't drop it.
The comp overrides `padding` inline on **all six** bodies — that is a signal `--pane-pad`
needs per-pane variants: `--pane-pad-tight: 4px 14px 12px` (log), `--pane-pad-canvas:
14px 16px` (contributions), `--pane-pad: 16px 18px` (default).

### 3.4 `.commit` / `.rail` — `layers/data.css`
```css
.commit{display:flex;align-items:baseline;gap:24px;line-height:1.1;}
.commit .graph{flex:0 0 22px;text-align:center;font-size:.8em;}
.commit .hash {flex:0 0 132px;font-weight:var(--fw-semibold);}
.commit .ref  {flex:0 0 auto;color:var(--text-faint);}
.commit .cyear{flex:0 0 96px;color:var(--text-dim);font-weight:var(--fw-bold);}
.commit .cmsg {flex:1 1 auto;color:var(--text-muted);}
.rail{height:30px;margin-left:10px;border-left:var(--bw-pane) solid var(--border-pane);}
```
`.rail` is the vertical connector drawn *between* commits (a `<div>`, not a pseudo-element),
so a commit list of N rows is `N` `.commit` + `N-1` `.rail`. `margin-left:10px` centres the
2px rule under the 22px `.graph` column — **but only if `.graph` is 22px wide**; at
`--bw-pane:2px` the true centre is `22/2 - 1 = 10`. If you shrink `.graph`, recompute
`.rail`'s margin or it detaches from the dots. (**M**, arithmetic on the two rules.)

**(M) Comp overrides:** `.hash` 132→**92px**, `.cyear` 96→**88px**. Slide `gap:24px` and
`height:30px` are *not* overridden — at 13px type a 24px gap is very loose and a 30px rail
is very tall. Re-derive both (§5.3).

Upstream `CommitLog.jsx` (**M**) already emits exactly this structure and supports
`{hash, ref, year, message, hue, head}`. It hardcodes `.hash` colour to `var(--yellow)`
while the comp colours each hash per-era — make `hue` drive both `.graph` and `.hash`.

Target React API:
```ts
type Commit = {
  hash: string;            // 7 lowercase hex chars
  ref?: string;            // "HEAD -> main, origin/main" | "tag: agent/v1"
  year: string;            // "2025–now"
  title: string;           // bold lead (fg0/fg1, weight 700)
  detail?: string;         // em-dash tail (fg2)
  stack?: string[];        // NEW: renders as a dim chip row, mobile line 3
  hue?: 'red'|'green'|'yellow'|'blue'|'purple'|'aqua'|'orange'|'fg4';
  head?: boolean;          // HEAD styling
  root?: boolean;          // no trailing .rail
};
CommitLog({ commits: Commit[], dense?: boolean })
```

### 3.5 `.meter` / `.metric` — present in DS, **unused by the comp**
```css
.meter{height:26px;background:var(--surface-bar);border-radius:var(--r-chip);
       overflow:hidden;box-shadow:var(--shadow-inset-track);}
.meter .fill{height:100%;width:var(--val,50%);
       background:linear-gradient(90deg,var(--g1,var(--accent-d)),var(--g2,var(--accent)));}
@media (prefers-reduced-motion:no-preference){
  .meter .fill.anim{animation:grow var(--dur-meter) var(--ease-out) both;
                    animation-delay:var(--d,.5s);}}
@keyframes grow{from{width:0;}}
```
**The comp's seek track is a hand-rolled `.meter` with a different height (8px vs 26px) and
the same `--shadow-inset-track`** (comp:107-108). Unify: `<Meter value height gradient>`
serves the seek bar, and would serve any future "contributions this year" stat bar.
`--dur-meter:1.1s`, `--ease-out:cubic-bezier(.2,.7,.2,1)`, delay via `--d`.

### 3.6 `.tmux` / `.seg` / `.pl` / `.plr` — `layers/tmux.css`
```css
.tmux{flex:0 0 auto;height:var(--tmux-h);display:flex;align-items:stretch;
  font-size:var(--fs-micro);font-weight:var(--fw-semibold);letter-spacing:.02em;
  background:var(--surface-bar);color:var(--text-dim);z-index:30;
  border-top:var(--bw-hard) solid var(--border-hard);}
.tmux .seg{position:relative;display:flex;align-items:center;padding:0 18px;white-space:nowrap;}
.tmux .spacer{flex:1 1 auto;}
.tmux .seg::after,.tmux .seg::before{content:none;position:absolute;top:0;bottom:0;
  width:var(--pl-w);z-index:2;}
.tmux .seg.pl::after {content:"";left:100%; background:inherit;clip-path:polygon(0 0,100% 50%,0 100%);}
.tmux .seg.plr::before{content:"";right:100%;background:inherit;clip-path:polygon(100% 0,0 50%,100% 100%);}
.tmux .session{background:var(--accent);color:var(--bg-h);font-weight:var(--fw-black);padding-left:22px;}
.tmux .clock  {background:var(--accent);color:var(--bg-h);font-weight:var(--fw-black);
               padding-left:calc(var(--pl-w) + 8px);padding-right:22px;}
```
Anatomy: `background:inherit` on the arrow pseudo-element is the trick — each segment paints
its own arrow, so no colour bookkeeping. `.pl` = arrow points **right** (chain flows L→R,
used on the left cluster); `.plr` = arrow points **left** (chain flows R→L, right cluster).
The segment *after* a `.pl` must therefore reserve `padding-left ≥ --pl-w` or the arrow
overlaps its text — which is why the comp writes `padding:0 9px 0 16px` on every segment
after the session (16 > 12 = `--pl-w`). **Encode that as `padding-left:calc(var(--pl-w) + 4px)`
instead of a magic 16.** (**I**)

**(M) `.tmux` has no `overflow` and no wrapping.** Every `.seg` is `white-space:nowrap`.
Six segments at `--fs-micro:11px` JetBrains Mono (0.6em advance ⇒ 6.6px/char) with content
`NORMAL` + ` main` + `kevinweaver.dev` + `☰ 1826/1826` + `100%` + `09:41` = 48 glyphs
≈ 317px of text, plus 6 × ~25px of padding ≈ **~470–515px minimum width**. Below that the
bar overflows horizontally and, because `<body>` has no `overflow-x:hidden`, produces a
horizontal scrollbar on the whole page. **This is a real mobile break at 360–414px.** §7.

React API (upstream `TmuxBar.jsx` assumes a `windows[]` model the comp doesn't use):
```ts
type Seg = { text: ReactNode; arrow?: 'right'|'left'|'none'; bg?: string; fg?: string;
             bold?: boolean; tabular?: boolean; hideBelow?: 'sm'|'md'; key: string };
TmuxBar({ segs: Seg[], accent?: string })   // `spacer` is a Seg with text:null, flex:1
```
Segments must carry `hideBelow` so the bar can shed `kevinweaver.dev` and `☰ n/N` on phones.

### 3.7 `.ph` (striped placeholder) — DS, unused
```css
.ph{background-image:repeating-linear-gradient(135deg,rgba(146,131,116,.14) 0 2px,
    transparent 2px 16px);border:var(--bw-pane) dashed var(--border-dashed);
    border-radius:var(--r-ph);display:flex;align-items:center;justify-content:center;}
```
**Use it for the private-repo cluster's HTML fallback and for canvas loading states.** The
comp draws its own version of exactly this pattern **in canvas** for private repos
(comp:773-778: `rgba(168,153,132,.18)` diagonal hatch at 6px pitch inside a clipped circle,
plus a `setLineDash([6,5])` `#665c54` 2px ring). The two should share a token so the
"redacted" language reads identically in DOM and canvas. (**I**)

### 3.8 `.kw-*` — comp-local layout classes (7)
| Class | Purpose | Base style (all inline) |
|---|---|---|
| `.kw-instr` | first-viewport instrument section | `height:calc(100vh - 60px);min-height:520px` |
| `.kw-lower` | graph + tail split | `flex:1;min-height:0;display:flex;gap:14px` |
| `.kw-graph` | gource canvas box | `position:relative;flex:1;min-height:0;background:var(--bg-h)` |
| `.kw-tail` | event log pane | `flex:0 0 320px;width:320px;min-width:0` |
| `.kw-2up` | man-page + git-log grid | `display:grid;grid-template-columns:1fr 2fr;gap:14px` |
| `.kw-pad` | `<main>` padding hook | `padding:14px` |
| `.kw-hide-sm` | hide ≤720px | — |
| `.kw-hide-md` | **defined, never applied** (**M**, 0 markup matches) | — |

These are the site's own layout primitives, not DS. **Move all seven out of inline styles
into a real stylesheet** — the comp puts base styles inline and overrides them from a media
query with `!important`, which is the only reason `!important` appears at all.

### 3.9 Components the site needs that the DS does not have
`<Scanline>`, `<StatusPill>` (dot + label + `kw-pulse`), `<TransportBar>` (play/seek/jump/
speed), `<EventLog>` (append + trim + `kw-logIn`), `<BootConsole>` (typed lines),
`<CanvasPane>` (DPR sizing + ResizeObserver + `_w/_h` bookkeeping), `<ContribTooltip>`,
`<GraphLegend>`, `<ManPage>` (label + block list), `<ContactTiles>`.

---

## 4. Animations and interactions

### 4.1 Inventory

| # | Behaviour | Driver | Where | Reduced-motion? |
|---|---|---|---|---|
| 1 | Boot console typing | `stepBoot(ts)` in rAF, 1 line / 100 ms | comp:436-447 | ✅ never runs (`!this.rm` gate, comp:206) |
| 2 | Boot line entrance | `kw-logIn .3s ease both` | comp:443 | ✅ (overlay never mounts) |
| 3 | Event-log line entrance | `kw-logIn .25s ease both` | comp:933 | ⚠️ still fires (settleStatic pushes 2 lines) |
| 4 | Live-dot blink | `kw-pulse 1.1s steps(1) infinite` | comp:966 | ✅ set to `'none'` when `rm` |
| 5 | Backwards playback | rAF, `day -= speed * dt` | comp:887 | ✅ rAF never started (comp:457) |
| 6 | Gource graph paint | rAF `drawGraph()` | comp:705-869 | ✅ static via `settleStatic()` |
| 7 | Ribbon + overview paint | rAF `drawRibbon/drawOverview` | comp:571-568 | ✅ single `drawAll()` |
| 8 | Live-cell breathing ring | `sin(performance.now()/500)` alpha 0.3→0.8 | comp:623 | ✅ (inside rAF) |
| 9 | Agent-birth flash | `this.flash` 1→0 at −0.012/frame | comp:859-868 | ✅ |
| 10 | Converge line (both actors, same repo) | `this.converge` 1→0 at −0.02/frame | comp:850-857 | ✅ |
| 11 | Beam decay | `b.life -= 0.022`/frame | comp:754 | ✅ |
| 12 | File heat decay | `f.heat *= 0.955`/frame | comp:797 | ✅ |
| 13 | Repo alpha/position easing | `+= (target - cur) * 0.045` | comp:745-748 | ✅ `this.snap` forces k=1 |
| 14 | Actor position easing | `+= (t - c) * 0.09` | comp:829 | ✅ |
| 15 | Nav active-section sync | `scroll` → rAF-throttled `syncNav()` | comp:492-508 | n/a (not motion) |
| 16 | Overview drag-to-scrub | `mousedown` + window `mousemove/up` | comp:509-517 | n/a |
| 17 | Ribbon hover tooltip | `onmousemove` → `hover(e)` | comp:473-475, 686-702 | n/a |
| 18 | Clock tick | `tickClock()` every rAF frame | comp:979-984 | ❌ **never runs under rm** (loop not started) → clock frozen at markup literal `09:41` |
| 19 | "Live" event emitter | `setInterval(…, 2600)` | comp:460, 948-959 | ✅ interval only started in `begin()` after the rm early-return |
| 20 | **Bomberman bot** | `drawGame()` + keydown arrows/`x` | comp:637-684, 483-491 | partial |
| 21 | Scanline | static CSS | comp:50 | n/a (does not move) |
| 22 | Pane focus shadow | static CSS | `pane.css` | n/a |

### 4.2 Refs — 19 declared, 18 bound, 1 dead
**(M)** Constructor (comp:199-203) declares 19; `grep -oE 'ref="\{\{ [a-zA-Z]+ \}\}"'`
finds 18 in markup. **`clockRef` has no markup binding** yet `tickClock()` writes to it
(comp:982) — dead code. Same for `infoOpen` / `onInfoIn` / `onInfoOut` (comp:206, 990-991):
declared in state and `renderVals()`, consumed by **nothing**.

Bound refs and what writes them:

| Ref | Element | Written by |
|---|---|---|
| `overRef` | 5-year overview canvas | `sizeAll`, `drawOverview`, drag handler |
| `ribbonRef` | 53-week ribbon canvas | `sizeAll`, `drawRibbon`, `hover` |
| `graphRef` | gource canvas | `sizeAll`, `drawGraph` |
| `tipRef` | hover tooltip | `hover()` sets `display/left/top/innerHTML` |
| `logRef` | event log body | `pushLog()` appends + trims |
| `bootRef` | boot console body | `stepBoot()` appends |
| `graphDateRef` | date in gource pane-bar | `loop`, `syncHead` |
| `seekFillRef` | seek bar fill width | `syncHead` |
| `seekBirthRef` | purple birth tick `left` | `paintStatic` (once) |
| `speedRef` | `"12 days/sec"` | `paintStatic`, `onSpeed` |
| `playRef` | `⏸`/`▶` glyph | `onToggle` |
| `pillRef`/`pillDotRef`/`pillTextRef` | status pill | `setPill()` |
| `navRef` | header nav | `syncNav()` |
| `barPosRef`/`barPctRef`/`barClockRef` | tmux segments | `syncHead`, `tickClock` |

**Port note:** 14 of these are **imperative DOM writes at 60 fps**. Do **not** convert them
to React state — that is 60 renders/sec. Keep them as refs with direct `.textContent` /
`.style` writes inside the rAF loop (`useRef` + a `useEffect`-mounted loop). Only
`booting` and `playing` belong in state. (**I**)

### 4.3 The playback model — **already runs backwards** ✅

This is the ground-truth "REVERSED" requirement, and the comp **already implements it**:

- `begin()` comp:451: `this.day = this.N - 1` (today), `this.live = true`,
  `this.winStart = this.N - 371` (the ribbon window is pinned to the most recent 53 weeks).
- `loop()` comp:876-897:
  ```js
  if (this.live) {                       // dwell on today for 4.2 s, streaming live events
    if (!this.dwellUntil) this.dwellUntil = ts + 4200;
    if (ts > this.dwellUntil) { this.live = false; this.dwellUntil = 0; this.setPill(); }
  } else {
    let sp = this.speeds[this.speedIdx];
    if (Math.abs(this.day - this.birthIdx) < 6) sp = Math.min(sp, 2.5);   // slow-mo at the agent birth
    const prev = Math.floor(this.day);
    this.day = Math.max(0, this.day - sp * dt);     // ← WALKS BACKWARDS
    const now = Math.floor(this.day);
    for (let i = prev - 1; i >= now; i--) this.emitDay(i);
    ...
    if (this.day <= 0) { this.pushLog('— reached 01 aug 2021 · jumping to today —','dim');
                         this.day = this.N - 1; this.snap = true; this.goLive(); }
  }
  ```

**(M) Derived timings** (`N = 1826`, speeds `[4,8,12,20,32]` days/sec, default 12):

| speed | full 2026→2021 traversal | + 4.2 s dwell | loop period |
|---|---|---|---|
| 4 d/s | 456.5 s | — | **7 min 40 s** |
| 8 | 228.3 | — | 3 min 53 s |
| **12 (default)** | **152.2** | | **2 min 36 s** |
| 20 | 91.3 | — | 1 min 36 s |
| 32 | 57.1 | — | 1 min 01 s |

Plus a ~2.4 s slow-mo dilation crossing the agent-birth date (speed clamped to 2.5 d/s for
±6 days). "Playback duration is deliberately not pinned" is satisfied by the speed control.

**Data-loading consequence (M/I).** `init()` comp:413-414 seeds the log from
`i = this.N - 40` — **the first paint only needs the most recent 40 days**. Then playback
consumes days backwards at `speed` days/sec. At the default 12 d/s:

| Chunk | Days | Covers playback seconds | Must arrive by |
|---|---|---|---|
| `recent.json` | last 90 d | 0 – 7.5 s | **first byte / inlined in HTML** |
| `y-2025.json` | days 1096–1461 | 7.5 – 38 s | +7 s |
| `y-2024.json` | 731–1095 | 38 – 68 s | +38 s |
| `y-2023.json` | 366–730 | 68 – 98 s | +68 s |
| `y-2021-22.json` | 0–365 | 98 – 152 s | +98 s |

**One 365-day chunk buys 30 s of runway at 12 d/s and 11 s at the fastest speed (32 d/s).**
Even a 3G fetch clears that. Combined with the measured "full corpus ≈ 200–250 KB gzipped"
(`docs/research/2026-07-31-measured-findings.md:100`), **inline the last 90 days and lazily
fetch the rest per-year, newest-first.** The overview strip (`drawOverview`) needs *all
1826 day totals* to paint though — but that is one `Uint16Array(1826)` ≈ **3.6 KB raw /
~1.2 KB gzipped**. Ship the totals array eagerly, the event detail lazily. (**I**)

### 4.4 Frame-rate-dependent decay — a real bug to fix in the port
**(M)** `this.day -= sp * dt` is correctly dt-scaled. **Everything else is not:**
`b.life -= 0.022` (comp:754), `f.heat *= 0.955` (797), `this.flash -= 0.012` (860),
`this.converge -= 0.02` (851), `r.alpha += (…) * 0.045` (746), `r.px += (…) * 0.045` (747),
`a.x += (…) * 0.09` (829), `r.hot += (0.34 - r.hot) * 0.02` (718).

On a 120 Hz display every one of these decays/eases **exactly twice as fast** as on 60 Hz.
Fix by converting to a half-life form: `v *= Math.pow(k, dt * 60)` and
`v += (t - v) * (1 - Math.pow(1 - k, dt * 60))`.

### 4.5 Redraw discipline
**(M)** `loop()` comp:900 calls `drawGraph(); drawRibbon(); drawOverview();`
**unconditionally every frame**, including while `playing === false`. The overview strip
repaints 1826 `fillRect`s + 5 year rules 60×/sec for a picture that only changes when
`winStart` or `day` moves. Gate it: repaint the overview only on `winStart`/`day` integer
change, and the ribbon only on `winStart` change or a live-ring frame. (**I**)

### 4.6 Interaction surface (7 handlers + 3 native)
- `onToggle` — play/pause, flips `playRef.textContent` between `⏸` and `▶`, calls `setPill()`
- `onSeek(e)` — `seekTo(round((clientX - left)/width * N))`; **note it seeks to an
  absolute day index left→right = 2021→2026**, while the *animation* runs right→left.
  The fill bar therefore *shrinks* during playback. That is coherent but worth an explicit
  affordance (`⏮ 2021` sits on the left, `⏭ live` on the right).
- `onJumpStart` → `seekTo(0)`; `onJumpBirth` → `seekTo(birthIdx + 4)`; `onJumpLive` →
  `seekTo(N-1)` then `goLive()`
- `onSpeed` — cycles `[4,8,12,20,32]`
- `onSkipBoot` — `endBoot()`
- **native:** ribbon `onmousemove`/`onmouseleave` (tooltip); overview `onmousedown` +
  window `mousemove`/`mouseup` (scrub); `window keydown`
- **`window` keydown** comp:477-491 handles `Space` (toggles `this.userPlay` — **the
  Bomberman flag, NOT playback**), arrow keys, and `x` (drop bomb).

**(M) `Space` is captured with `e.preventDefault()` on `window` unconditionally** — so the
`<button>` at comp:106 cannot be activated with Space, and the page cannot be paged down
with Space. This is a bug that survives even after the game is cut.

### 4.7 Bomberman — CUT, and here is exactly what to delete
Per ground truth the arcade game is out of scope. Delete:
- `drawGame(g, gm)` — comp:637-684 (48 lines)
- the call site `this.drawGame(g, {left, top, step, cell, cw, weeks})` — comp:633
- `this.walkable` assignment — comp:642
- the entire `window.addEventListener('keydown', …)` block — comp:477-491 (`Space`,
  arrows, `x`, `this.bot`, `this.userPlay`)
- `this.bot`, `this.userPlay`, `this.boomAt` references in `drawGame` only
- the misleading `drawRibbon` doc-comment *"(and the board the game is played on)"* comp:570
- the doc-comment *"the ribbon IS the level: 0 = wall, 1–3 = floor, 4+ = destructible"* comp:636

**Net −65 lines.** `this.rbGeom` (comp:577) must stay — `hover()` depends on it.
After deletion, `Space` becomes free for **play/pause**, which is the obvious binding.

### 4.8 "Live" — CUT as a transport, but keep as a local ticker
Ground truth cuts the live/WebSocket/polling transport. **Nothing in the comp is a
transport.** `emitLive()` (comp:948-959) picks a random event from `this.days[N-1]` (or
`N-2` if empty), re-rolls a random file, and pushes a log line — a purely local synthesiser
on a 2600 ms `setInterval`. The `live` pill, the green breathing ring on today's cell
(comp:620-626), and the 4.2 s "dwell on today" are all client-side.

**Recommendation:** keep all of it; rename the pill from `live` to something honest.
Suggested: **`fresh · 2h ago`** driven by a `generatedAt` field in the data payload, with
the dot turning `--yellow` past 24 h and `--fg4` past 7 d. Zero network beyond the payload
you already fetch. (**I**)

---

## 5. Responsive re-derivation of the type scale

### 5.1 The problem, precisely
`tokens/typography.css` is authored for a 1920×1080 slide that `deck-stage` scales as a
whole (`--fs-hero:200px`). The comp already patched **six** of the ten steps to fixed px on
one root `<div>` and **left four undefined**. So today:

| token | DS slide | comp override | ratio | if used unpatched on the web |
|---|---|---|---|---|
| `--fs-stat` | 240px | — | — | **240px** 💥 |
| `--fs-hero` | 200px | — | — | **200px** 💥 |
| `--fs-h1` | 108px | — | — | **108px** 💥 |
| `--fs-h2` | 72px | — | — | **72px** 💥 |
| `--fs-h3` | 52px | 22px | .423 | ok |
| `--fs-lead` | 40px | 17px | .425 | ok |
| `--fs-body` | 30px | 14px | .467 | ok |
| `--fs-mono` | 28px | 13px | .464 | ok |
| `--fs-small` | 24px | 12px | .500 | ok |
| `--fs-micro` | 24px | 11px | .458 | ok |

Two further problems with the comp's fix: (a) everything is **absolute px**, including
`font-size:13px` on the root — a user who sets their browser base font to 20px gets no
change at all; (b) the scale is flat across every viewport, so 13px body copy on a 360px
phone is identical to 13px on a 1560px desktop, even though the phone needs it *larger*.

### 5.2 The re-derivation

Design intent: **the terminal chrome stays small and dense (it is chrome, and its density
is the aesthetic); the prose gets promoted to a genuinely readable size and a new
`--fs-prose` step is introduced; the four display steps are re-derived from scratch, since
nothing in the comp establishes them.**

Fluid band: **360px → 1560px** (1560 = `<main>`'s `max-width` and the comp's `$preview.width`).
All values in `rem` so browser font-size preference works.
`clamp(min, intercept + slopevw, max)` with `slope = (max−min)/1200`,
`intercept = min − slope·360`.

```css
:root {
  /* ---- terminal chrome: dense, barely grows ---- */
  --fs-micro: clamp(0.625rem,  0.6062rem + 0.0833vw, 0.6875rem); /* 10 → 11 px */
  --fs-small: clamp(0.6875rem, 0.6687rem + 0.0833vw, 0.75rem);   /* 11 → 12 px */
  --fs-mono:  clamp(0.75rem,   0.7219rem + 0.125vw,  0.8438rem); /* 12 → 13.5 px */
  --fs-body:  clamp(0.8125rem, 0.7844rem + 0.125vw,  0.9063rem); /* 13 → 14.5 px */

  /* ---- NEW step: readable prose (man-page paragraphs, commit messages) ---- */
  --fs-prose: clamp(0.9375rem, 0.9094rem + 0.125vw,  1.0313rem); /* 15 → 16.5 px */

  /* ---- display ladder, re-derived for the web ---- */
  --fs-lead:  clamp(1rem,      0.9437rem + 0.25vw,   1.1875rem); /* 16 → 19 px */
  --fs-h3:    clamp(1.125rem,  1.0125rem + 0.5vw,    1.5rem);    /* 18 → 24 px */
  --fs-h2:    clamp(1.375rem,  1.1875rem + 0.8333vw, 2rem);      /* 22 → 32 px */
  --fs-h1:    clamp(1.75rem,   1.45rem + 1.3333vw,   2.75rem);   /* 28 → 44 px */
  --fs-hero:  clamp(2.125rem,  1.5625rem + 2.5vw,    4rem);      /* 34 → 64 px */
  --fs-stat:  clamp(2.5rem,    1.75rem + 3.3333vw,   5rem);      /* 40 → 80 px */

  /* line heights — DS values are fine, but body needs loosening at prose size */
  --lh-tight:.9; --lh-heading:1.04; --lh-body:1.5; --lh-code:1.6;
  --lh-prose:1.65;   /* NEW */
  --lh-chrome:1.55;  /* NEW — the comp's root line-height */
}
html { font-size: 100%; }            /* never set px on :root */
.kw-app { font-size: var(--fs-mono); line-height: var(--lh-chrome); }
```

**(M) Rendered px at nine checkpoints** (computed, `/tmp/scale.js`):

```
size           360     414     540     720     834    1080    1280    1560    1920
fs-micro      10.0    10.0    10.2    10.3    10.4    10.6    10.8    11.0    11.0
fs-small      11.0    11.0    11.2    11.3    11.4    11.6    11.8    12.0    12.0
fs-mono       12.0    12.1    12.2    12.4    12.6    12.9    13.2    13.5    13.5
fs-body       13.0    13.1    13.2    13.4    13.6    13.9    14.2    14.5    14.5
fs-prose      15.0    15.1    15.2    15.4    15.6    15.9    16.1    16.5    16.5
fs-lead       16.0    16.1    16.4    16.9    17.2    17.8    18.3    19.0    19.0
fs-h3         18.0    18.3    18.9    19.8    20.4    21.6    22.6    24.0    24.0
fs-h2         22.0    22.4    23.5    25.0    25.9    28.0    29.7    32.0    32.0
fs-h1         28.0    28.7    30.4    32.8    34.3    37.6    40.3    44.0    44.0
fs-hero       34.0    35.4    38.5    43.0    45.9    52.0    57.0    64.0    64.0
fs-stat       40.0    41.8    46.0    52.0    55.8    64.0    70.7    80.0    80.0
```

Hierarchy check: the ratio between adjacent display steps holds at **1.22–1.33** across the
whole band (h3→h2→h1→hero→stat), and chrome→prose is a deliberate **1.14× jump** that reads
as "this is content, not chrome". At 1560px the four preserved steps land within 0.5px of
the comp's hand-tuned values (11/12/13.5/14.5 vs 11/12/13/14), so **nothing in the existing
comp changes visually on desktop**.

### 5.3 Geometry, re-derived the same way

```css
:root {
  --bar-h:    clamp(1.75rem,   1.675rem + 0.3333vw, 2rem);       /* 28 → 32 px */
  --tmux-h:   clamp(1.375rem,  1.3rem + 0.3333vw,   1.625rem);   /* 22 → 26 px */
  --pane-gap: clamp(0.625rem,  0.55rem + 0.3333vw,  0.875rem);   /* 10 → 14 px */
  --pl-w:     clamp(0.625rem,  0.5875rem + 0.1667vw,0.75rem);    /* 10 → 12 px */
  --sp-1:     clamp(0.25rem,   0.2125rem + 0.1667vw,0.375rem);   /*  4 →  6 px */
  --sp-2:     clamp(0.625rem,  0.55rem + 0.3333vw,  0.875rem);   /* 10 → 14 px */
  --sp-3:     clamp(0.8125rem, 0.7188rem + 0.4167vw,1.125rem);   /* 13 → 18 px */
  --sp-4:     clamp(1.125rem,  0.975rem + 0.6667vw, 1.625rem);   /* 18 → 26 px */
  --sp-5:     clamp(1.5rem,    1.3125rem + 0.8333vw,2.125rem);   /* 24 → 34 px */

  --pane-pad:        var(--sp-2) var(--sp-3);      /* 10 14 → 14 18 */
  --pane-pad-canvas: var(--sp-2) var(--sp-2);
  --pane-pad-tight:  4px var(--sp-2) var(--sp-2);
  --pane-bar-pad:    0 var(--sp-3);
  --pane-bar-gap:    var(--sp-2);
  --dot-size:        clamp(0.4375rem, 0.4rem + 0.1667vw, 0.5625rem); /* 7 → 9 px */
  --dot-gap:         clamp(0.3125rem, 0.2938rem + 0.0833vw, 0.375rem);
  --r-pane:6px; --r-chip:4px; --r-ph:6px; --bw-pane:2px; --bw-hard:2px;
}
```
And two **overrides of slide-scale leaks in `layers/data.css`**, which the comp never fixed:
```css
.commit { gap: var(--sp-2); }                         /* 24px → 10–14px */
.commit .graph { flex:0 0 1.125rem; }                 /* 22px → 18px    */
.commit .hash  { flex:0 0 5.75rem; }                  /* 132px → 92px (comp already did this) */
.commit .cyear { flex:0 0 5.5rem; }                   /* 96px → 88px  (comp already did this) */
.rail { height: clamp(14px, 1.25rem, 20px);
        margin-left: calc(1.125rem / 2 - var(--bw-pane) / 2); }  /* stays centred under .graph */
.dots i { width: var(--dot-size); height: var(--dot-size); }
.dots   { gap: var(--dot-gap); }
```
The `.rail` `margin-left` is now **derived from `.graph`'s width**, so the two can never
drift apart again (the DS's literal `10px` silently assumes `.graph:22px` + `--bw-pane:2px`).

### 5.4 Where each step is used
| token | used by |
|---|---|
| `--fs-micro` | pane-bar titles, tmux segments, header, legend, captions, log lines, `SEE ALSO`/`NAME` labels |
| `--fs-small` | man-page section labels, contact glyphs, boot console |
| `--fs-mono` | app root, canvas text (`9px`–`13px` literals in canvas — see below) |
| `--fs-body` | transport controls, event log |
| **`--fs-prose`** | man-page `<p>`, `.cmsg` |
| `--fs-lead` | `NAME` line, pane titles of the two hero panes |
| `--fs-h3` | section headings (`whoami`, `arc`, `contact` — **currently absent**, §8.4) |
| `--fs-h1` | the page `<h1>` (**currently absent**) — `KEVIN WEAVER` |
| `--fs-hero`/`--fs-stat` | reserved; the natural home is a big `10,001 contributions` stat |

### 5.5 Canvas text does not inherit any of this
**(M)** Every `g.font` in the comp is a hardcoded px literal:
`'700 9px'` (overview year rules, comp:554), `'600 9px'` (ribbon weekday/month, 580),
`'800 9px'` (birth label 630; actor initials 836/844), `'800 13px'` (repo label measure, 721),
`'600 9px'` (file labels, 807), `(big?'800 ':'600 ')+(big?13:11)+'px'` (repo labels, 818),
`'700 9px'` (star counts, 822), `'800 20px'` / `'600 11px'` (birth flash, 863/865).

**9px is below every accessibility floor and does not scale with the user's font setting.**
Port fix: read the resolved value once per resize and derive canvas fonts from it —
```js
const cs = getComputedStyle(rootEl);
const px = (tok) => parseFloat(cs.getPropertyValue(tok));
this.F = { micro: px('--fs-micro'), small: px('--fs-small'), mono: px('--fs-mono') };
g.font = `600 ${this.F.micro}px "JetBrains Mono", monospace`;
```
and re-read it in the `ResizeObserver` callback (which already exists, comp:416). (**I**)

---

## 6. Where the grid and the gource animation live — exact geometry

### 6.1 Two grids, not one

**(M)** The contribution data is rendered **twice**, in two canvases in the *same* pane:

| | `overRef` (overview strip) | `ribbonRef` (the ribbon) |
|---|---|---|
| Pane | `.pane` "contributions", body block A | same pane, body block B |
| CSS size | `width:100%` × **50px** | `width:100%` × **140px** |
| Backing store | `w*dpr × h*dpr`, `dpr = min(2, devicePixelRatio)` (comp:521) | same |
| Range | **all 1826 days / 261 weeks** | **53 weeks** starting at `winStart` |
| Cell | `cw = W/weeks`, `ch = (H-11)/7` — **no gap**, `fillRect(x,y,cw-0.4,ch-0.4)` | `cell` square, see below |
| Chrome | 5 year rules (`rgba(80,73,69,.85)` 1px) + year labels at y=7; purple birth rule 2px full height; a **window brush** (two `rgba(15,16,17,.6)` scrims either side of `[winStart, winStart+371]` + a `rgba(251,241,199,.75)` 1.5px stroke); a `rgba(251,241,199,.9)` 1.2px playhead hairline | 28px weekday gutter (`mon`/`wed`/`fri`), 20px month-label strip, per-cell agent band, playhead wash + hairline box, green breathing ring on today, purple birth rule + `◆ agent initialized` label |
| Cursor | `ew-resize` | default (hover → tooltip) |
| Interaction | drag to scrub `winStart` | hover → `tipRef` tooltip |

The overview is a **scrubber / minimap**; the ribbon is the **readable grid**. Both are in
`.pane > .pane-body`, stacked with `gap:9px`, total pane ≈ **274px** tall (§2.4.1).

### 6.2 Ribbon internal geometry (comp:575-577)
```js
const weeks = 53, left = 28, top = 20;
const cw   = (W - left) / weeks;
const cell = Math.min(cw - 2.5, (H - top - 14) / 7 - 2.5);
const step = cell + 2.5;
// then:  x = left + w * cw          y = top + d * step
```

**(M) Bug — anisotropic gutters.** `x` advances by **`cw`** but `y` advances by
**`step = cell + 2.5`**. At `H = 140`: `(140−20−14)/7 − 2.5 = 12.64px` cell.
At `W = 1198` (desktop `.kw-graph` sibling width): `cw = (1198−28)/53 = 22.08px`.
So horizontal gutter = `22.08 − 12.64 = 9.4px` while vertical gutter = `2.5px` — the grid
reads as **columns of dashes**, not a GitHub-style square lattice.

The crossover: the ribbon is height-bound whenever `(W−28)/53 − 2.5 ≥ 12.64`, i.e.
**`W ≥ 830px`**. Below 830px it is width-bound and the gutters match.
**Fix:** compute `cell` first, then set `stepX = stepY = cell + gap` and centre the whole
`53*(cell+gap)` block horizontally, *or* let `cell` follow `cw` and grow the pane's height.
The second is better for a website — bump block B from `140px` to
`clamp(120px, 20vh, 200px)` and let the cells be square at ~18px on desktop. (**I**)

Ribbon window is **371 days = 53 weeks** everywhere (`winStart + 371`, comp:514, 562, 891,
941, 1024). The default view is the trailing 53 weeks; the **5-year default view** required
by product is the *overview strip*, which is always full-range. Both requirements are met.

### 6.3 Colour ramp — 10 log2 bands (computed, `/tmp/ramp.js`)
`buildColors()` comp:240-251 builds two 10-step OKLCh ramps. Exact sRGB output:

| lvl | bin | human `LV` | agent `AG` | days (comp) | `LV` vs `#1d2021` | vs prev level |
|---|---|---|---|---|---|---|
| 0 | 0 | `#32302f` | `#32302f` | 17 | 1.25 | — |
| 1 | 1 | `#385027` | `#6a334c` | **156** | 1.83 | 1.47 |
| 2 | 2–3 | `#4c6627` | `#884161` | 81 | 2.53 | 1.38 |
| 3 | 4–7 | `#647c27` | `#a55178` | 25 | 3.48 | 1.38 |
| 4 | 8–15 | `#7b901e` | `#c15f8c` | 25 | 4.57 | 1.31 |
| 5 | 16–31 | `#95a10e` | `#da6d9f` | 20 | 5.76 | 1.26 |
| 6 | 32–63 | `#b0b103` | `#f27cb2` | 23 | 7.13 | 1.24 |
| 7 | 64–127 | `#cec012` | `#ff8ec5` | 17 | 8.72 | 1.22 |
| 8 | 128–255 | `#f1d146` | `#ffa7db` | 5 | 10.89 | 1.25 |
| 9 | 256+ | `#ffe87c` | `#ffc6f5` | 1 | 13.34 | 1.22 |

`this.BINDAYS = [17,156,81,25,25,20,23,17,5,1]` (comp:250) **sums to exactly 370** and
`156` matches the measured ground-truth mass point at n=1. `this.BINS` labels
`['0','1','2–3',…,'256+']` are used in the hover tooltip. **This ramp is real, keep it.**

The ramp starts at gruvbox green and rotates hue 120°→88° while lightness climbs
0.26→0.945, ending at a warm gold — so it reads as "cool/quiet → hot/gold" rather than
GitHub's monochrome green. `AG` mirrors it at hue **353°** (pink) with chroma
`c*0.78 + 0.03`. Level 0 is hard-overridden to `#32302f` (gruvbox `bg0_s`) in both.

`level(n)` (comp:253-264) is the exact log2 ladder: `0 / 1 / ≤3 / ≤7 / ≤15 / ≤31 / ≤63 /
≤127 / ≤255 / else`.

Two contrast problems fall out (§8.1): level 0→1 is **1.47:1** and level 1 against the pane
surface is **1.83:1**.

### 6.4 Gource pane geometry
Canvas fills `.kw-graph` (`flex:1; min-height:0`). **No fixed aspect ratio.** Internal
padding is baked into the projection (comp:710):
```js
const P = (r) => ({ x: 40 + r.px * (W - 80), y: 34 + r.py * (H - 74) });
```
⇒ **40px left/right, 34px top, 40px bottom** of dead margin. At the 720px breakpoint the
canvas is 340px tall, so 74/340 = **22% of the height is padding** — re-derive these as
`clamp(16px, 4%, 40px)`. (**I**)

Measured desktop size at a 1080p viewport: section height `100vh − 60 = 960`; minus the
contributions pane 274, minus the 14 gap, minus the pane-bar 32, minus the transport 38
⇒ **`.kw-graph` = 602px tall**. Width `1560 − 28 (main pad) − 14 (gap) − 320 (tail) − 4
(borders) = 1194`. **Aspect ratio ≈ 1.98 : 1.**

Ring layout (comp:728-743): repos are placed on an **ellipse centred at (0.5, 0.46)** with
```js
rpx = max(0.30*(W-80), need / (2π))       // need = Σ 2*(R + labelWidth*0.55 + 14)
rx  = min(0.42, rpx/(W-80));  ry = min(0.38, rpx/(H-74)*0.82)
```
i.e. the ring **grows to fit the labels** and is capped at 42%/38% of the field. Repos are
sorted by `to` descending (most-recently-active first) and each occupies arc proportional to
its own label+radius need — so the ring never self-overlaps. Radius
`R = 9 + log2(vol + 2) * 4.4` (comp:386) ⇒ 9px for a 0-volume repo, ~55px for aiur (vol 1268).

Files are **nested satellites**, not packed circles: `fr = R + 16 + f.ring * 11` where
`f.ring = k % 3` and `f.ang = k * 2.399` (golden angle) — three concentric rings at
+16/+27/+38px, 22 files max per repo (26 for private). File dot radius `1.8 + heat*5.5`.
This is *not* the `d3.packSiblings` containment model from
`docs/research/2026-07-31-measured-findings.md:147` — **the comp uses a simpler radial
spoke layout.** Reconcile before building: the spoke layout is ~30 lines and needs no d3;
`packSiblings` gives true containment but needs the 35 KB viz runtime. **The comp's spoke
layout matches the ground-truth description "repos as large circles, individual FILES as
nested circles"** well enough and is far cheaper. (**I**)

Other channels encoded (comp:767-825):
- **volume → radius**; **reputation (stars) → a cream halo**, deliberately a *separate*
  channel: `prestige = clamp((log10(stars+1) − 2)/2.2)`, drawn as an `rgba(251,241,199,α)`
  ring at `R+6` with `shadowBlur 5 + prestige*16`. Comment comp:787: *"reputation is a
  separate channel from volume: a cream halo, not a bigger circle."*
- **actor → stroke colour**: `agent #b16286`, `both #d79921`, `human #689d6a`
- **private → hatched fill + dashed `#665c54` ring + `#928374` label**, file names all
  `••••••/•••••••` (comp:308). Exactly the "blurred/obscured cluster" the product requires.
- **event kind → beam colour**: `commit #8ec07c`, `pr #d3869b`, `issue #fabd2d`,
  `review #83a598`; **agent beams are `lineWidth 2.2` + `setLineDash([5,4])`**, human beams
  `1.4` solid. That dash is the primary actor differentiator on the graph.
- **actor tokens**: human = an 11px `#689d6a` circle, `#8ec07c` 2px stroke + glow, label
  `kw`; agent = an 18×18 `#b16286` square **rotated 45°** (a diamond), `#d3869b` stroke +
  glow, label `ak`. Both labels are `#1d2021` 9px 800.

**(M) Fidelity bug:** `emitDay` sets the actor target to
`r.px + cos(f.ang)*0.03, r.py + sin(f.ang)*0.05` (comp:913) — an offset from the **repo
centre in normalised units**, not the file's actual pixel position on its ring. So actors fly
to *near the repo*, while the beam terminates on *the file*. The two do not meet. Fix by
projecting the file position back into normalised space.

### 6.5 Event log ("tail -f")
`pushLog(text, kind)` comp:928-937. Colour by kind: `agent → --purple`, `human → --aqua`,
`birth → --fg0` (+`font-weight:800`), `live → --green`, else `--fg4`.
Line format (`logLine`, comp:921-926):
`◉ commit a1b2c3d aiur → lib/runtime.ex` (human) / `◆ pull   … ` (agent).
Verbs are **space-padded to 6 chars** (`'commit'`,`'pull  '`,`'issue '`,`'review'`) so the
hash column aligns. Hashes are `Math.floor(Math.random()*0xfffffff).toString(16).slice(0,7)`
— **variable length**, so they do *not* actually align. Use `.padStart(7,'0')`.
Trim rule: `fit = max(8, floor((clientHeight − 16) / 20))`, `while (childElementCount > fit)
removeChild(firstElementChild)` — the `20` is a hardcoded line height that must become
`--fs-body * 1.8`. (**M**, comp:935-936.)

### 6.6 Boot console content (comp:422-433)
```
$ fetch gh://its-everdred/contributions --span=5y            [cmd  fg1]
  ⠿ 1,826 days · 5 years                          ok         [ok   green]
$ fetch gh://its-applekid/contributions                      [cmd]
  ⠿ 184 days · initialized 29-jan-2026            ok         [ok]
$ merge --strategy=sum-per-day                               [cmd]
  4,817 contributions · busiest 284 · 17 zero days           [dim  fg4]
$ bin --log2 --steps=10                                      [cmd]
  quantile rejected: 156-day mass point at n=1               [warn yellow]
  doubling bands accepted                         ok         [ok]
$ render --grid --graph --live                               [cmd]
```
One line per 100 ms; auto-dismiss at `bootLines.length + 2` ticks (≈1.2 s) or via the
2200 ms `bootKill` timer, whichever first; click anywhere to skip.
**This is excellent copy and it is all real measured data** — it is the site's thesis
statement (log2 beats quantile *because* of the 156-day mass point). Keep verbatim; only
`--live` needs rewording per §4.8, and `4,817 / 284 / 17` must be regenerated from the real
payload rather than hardcoded.

---

## 7. Resume content → man page + git log

### 7.0 The comp's content is placeholder and factually wrong

**(M)** Cross-checking §2.5 against the authoritative resume:

| Comp claims | Authoritative resume | Verdict |
|---|---|---|
| `2023–24 ethereum foundation web properties` | no such employer | **invented era** |
| `2022–23 0xmetropolis` | Metropolis, **Sep 2022 – Apr 2025** | wrong dates |
| `2021–22 consensys · truffle` | ConsenSys, Sep 2021 – Sep 2022 | ✅ correct |
| — | **Optimism, May 2025 – present** | **missing (the current job!)** |
| — | Stitch Fix, Dec 2017 – Sep 2021 | **missing** |
| — | EMS Heroes, Mar 2014 – Dec 2017 | **missing** |
| — | Omni Developers, Feb 2010 – Mar 2014 | **missing** |
| — | Rowan University, 2008 – 2012 | **missing** |
| `kevin@kevinweaver.dev` | `notkevinweaver@gmail` | **wrong** |
| `@its_everdred` | `@kevin_weaver` | **wrong** |
| NAME: "ethereum infrastructure, developer tooling, agent runtimes" | "LEAD FULLSTACK SOFTWARE ENGINEER" | rewrite |

**(M)** The comp's *repo* list is closer to real. `gh api graphql … repositoriesContributedTo`
returns **21** repos; overlaps with the comp's 19: `aiur-team/aiur` ✅,
`etherguild/etherguild.xyz` ✅, `its-everdred/gary` ✅, `its-everdred/skills` ✅,
`sapsaldog/claude-app-server` ✅, `ethereum/ethereum-foundation-website` ✅.
**Divergences:** the comp invents `its-applekid/{ethereum-archive, applekid-pi,
agent-actions, vector-eth}` — the real agent repo is **`its-applekid/actions`**. Real repos
the comp omits: `its-everdred/{dotfiles, scripts, flowerpot, symphony, opie, rancho-del-vote,
pico8, zazen, croptracker, biobreath_v2, its-applekid, claude-app-server}`,
`etherguild/ethismoney.xyz`, `carmensea/biobreath_v2`.
→ **The repo array must be generated by the DATA track, not hand-authored.**

### 7.1 `man kevin-weaver` — full section set

Render as a `<dl>`-shaped block list (label + body), one entry per man section. The comp has
3 of 5; here are all of them plus two optional extras. Copy is written in the comp's
lowercase terminal voice, except NAME/flag literals.

```
NAME
    kevin-weaver — lead fullstack software engineer

SYNOPSIS
    kevin-weaver [--web3] [--ethereum] [--public-goods]
                 [--stack ts|solidity|react|ruby] [--chain optimism|evm]
                 [--remote --tz America/Los_Angeles]
                 <human-coordination-problem>

DESCRIPTION
    Passionate web3 builder, Ethereum enthusiast, & public goods enjoyer
    designing human coordination tools on the internet's frontier.

    currently technical architect for the Actions SDK at optimism
    (actions.optimism.io) — connects embedded wallets to defi protocols, with
    allow/block listing and configuration for assets, markets, chains and
    other infra providers.

    before that: smart-contract dev tools at metropolis (arbitrary tx +
    contract deployment engine, tokenization and wallet infra, a multi-sig
    module), open-source dev tools at consensys (truffle, l2 bridging, evm
    debugging), and four years of customer-facing product at stitch fix
    serving millions of users.

OPTIONS
    --lang      typescript · solidity · ruby · php
    --runtime   hono · vite · express · next · rails · k8s
    --data      postgresql · mongodb · redis · graphql
    --chain     ethereum · optimism · evm
    --edu       rowan university · b.s. management information systems,
                minor computer science · 2008–2012
    -v          serial podcaster · technical educator ·
                hackathon connoisseur
    -vv         award-winning across nearly a dozen hackathons — rapid
                end-to-end web3 and full-stack builds spanning defi, nfts,
                governance, analytics dashboards, and social/creator tooling

ENVIRONMENT
    KW_LOCATION=CA,USA
    KW_STATUS=open to interesting problems

SEE ALSO
    git-log(1) · kevinmweaver.com · github.com/its-everdred ·
    linkedin.com/in/kevinweaver · @kevin_weaver
```

Mapping rules:
- **NAME** = name + the resume's job title, em-dash separated. One line, `--fs-lead`, `--fg1`.
- **SYNOPSIS** = the *tagline*, mechanically translated into flags. It is the only place the
  literal tagline sentence would read as boilerplate, so the tagline goes in DESCRIPTION and
  SYNOPSIS carries its *keywords* as flags. `--fs-prose`, `white-space:pre`, `--fg3`.
- **DESCRIPTION** = tagline verbatim (paragraph 1, `--fg1`), current role (paragraph 2,
  `--fg2`, with `optimism` in `--accent`), career compression (paragraph 3, `--fg2`).
  Paragraphs 4–6 of the resume (Stitch Fix, EMS Heroes, Omni) collapse into the git log
  rather than repeating here.
- **OPTIONS** = the SKILLS block. Every technology in the resume appears exactly once, as a
  flag value. **Education lives here as `--edu`** — an unusual but defensible move that
  avoids inventing a non-man section; the alternative is a `FILES` section.
- **SEE ALSO** = the contact block minus email/phone (those live in §2.6). `git-log(1)` is a
  cross-reference to the pane sitting immediately to its right — a nice touch that makes the
  two-up layout self-documenting.
- **Not rendered:** phone `<redacted-personal-phone>`. **Flag for the user:** publishing a personal mobile
  number on a public site invites SIM-swap and spam. Recommend omitting, or gating behind the
  `✉` tile. (**I**)
- Keep the comp's `SEE ALSO` technology list too? No — it duplicates OPTIONS. Drop it.

Optional flavour sections if the pane has room: `EXIT STATUS` (`0  shipped` / `1  learned
something`), `BUGS  report to github.com/its-everdred/kevinweaver-dev/issues` — the repo has
issues enabled (ground truth), so that link is live.

### 7.2 `git log --graph --oneline` — 9 rows

Reverse-chronological, matching real git semantics: HEAD at top, root commit at bottom.
The agent-birth entry is a **tag**, not a job, and gets `.ref` styling.

Short SHAs: the comp's hand-picked hexspeak has a bug (`0xc0de1` is not hex). Two options:

**(a) Deterministic — recommended.** `sha1(`${org}:${startMonth}`).slice(0,7)`. Computed now
(**M**, `printf '%s' "Optimism:2025-05" | sha1sum | cut -c1-7`):

| entity | short sha |
|---|---|
| `Optimism:2025-05` | `ee787a7` |
| `its-applekid:2026-01-29` | `b85c3e3` |
| `Metropolis:2022-09` | `538d21c` |
| `ConsenSys:2021-09` | `3437755` |
| `Stitch Fix:2017-12` | `3cc4bc6` |
| `EMS Heroes:2014-03` | `79c6a5b` |
| `Omni Developers:2010-02` | `4dc06be` |
| `Rowan University:2008-09` | `9ee7ca6` |

**(b) Hexspeak — all verified valid `[0-9a-f]{7}`:** `0ffcede`, `a11ceed`, `5ca1ab1`,
`c0de1ee`, `badca11`, `deadbee`, `defaced`, `fee15ed`, `facade1`, `decade5`, `beefc0d`.
Do **not** ship `0xc0de1`, `7ea1eaf` is fine, `a11ce55` is fine, `5eed128` is fine,
`c0ffee2` is fine.

Full row spec (`hue` drives both `.graph` ● and `.hash`; `.cyear` is `--fg3`; `.cmsg` = bold
title in `--fg0`/`--fg1` + em-dash detail in `--fg2` + optional `stack` chip row in `--fg4`):

| # | ● hue | hash | ref | cyear | title (bold) | detail | stack |
|---|---|---|---|---|---|---|---|
| 1 | `red` | `ee787a7` | `(HEAD -> main, origin/main)` | `2025–now` | `optimism · actions sdk` | technical architect — embedded wallets → defi protocols; allow/block listing, config for assets, markets, chains, infra providers | ts · hono · vite · react · solidity · k8s |
| 2 | `purple` | `b85c3e3` | `(tag: its-applekid/v1)` | `2026` | `its-applekid initialized` | second actor on the graph — 1,486 contributions in six months, 603 of them pull requests | — |
| 3 | `aqua` | `538d21c` | — | `2022–25` | `metropolis · lead engineer` | smart-contract dev tools — arbitrary tx + contract deployment engine, tokenization + wallet infra, multi-sig module | ts · express · next · react · solidity · redis · mongodb · graphql |
| 4 | `blue` | `3437755` | — | `2021–22` | `consensys · truffle` | open-source dev tools — truffle core, l2 bridging, evm debugging; ran os contributions, led a cross-org education effort | ts · solidity |
| 5 | `orange` | `3cc4bc6` | — | `2017–21` | `stitch fix · tech lead` | customer-facing features earning $millions, serving millions of users; microservice apis used across the org | ruby · rails · react · ts · postgresql · graphql |
| 6 | `yellow` | `79c6a5b` | — | `2014–17` | `ems heroes · co-founder` | medical records and billing software company | ruby · rails · javascript |
| 7 | `green` | `4dc06be` | — | `2010–14` | `omni developers · founder` | software consulting firm — cms, ecommerce, and healthcare web applications | php · javascript |
| 8 | `fg4` | `9ee7ca6` | `(root-commit)` | `2008–12` | `rowan university` | b.s. management information systems, minor computer science | — |

Notes:
- **Row 8 is `root:true`** → no trailing `.rail`. Its `.graph` glyph should be `◍` (or the
  git-log root marker) rather than `●`.
- **Hue choice is contrast-driven, not aesthetic.** Against the pane surface `#1d2021`
  (§8.1): aqua 7.79, green 7.94, yellow 9.67, orange 6.49, blue 6.09, purple 5.98, red 4.77
  — all ≥ 4.5 AA. **`gray #928374` is 4.47 and FAILS**, which is why row 8 uses `--fg4`
  (5.90) instead. Do not use `--gray` for any `.hash`.
- Optimism gets `--red` because the Optimism brand is red (`#FF0420`); gruvbox `--red`
  `#fb4934` is the nearest palette member and clears AA on the pane surface at 4.77.
- The pane-bar right slot `HEAD → main` stays, and now agrees with row 1's `.ref`.
- `--since=2021` in the pane title is **wrong** for a log that reaches 2008. Change the
  title to `git log --graph --oneline --all` or `git log --graph --oneline --reverse=false`.
  Recommended: **`git log --graph --oneline --author=kevin`**.
- Rows 5–8 are the pre-web3 career. They are the reason a recruiter can date the resume;
  they are also the four rows most likely to be collapsed on mobile. Spec: show rows 1–4
  expanded, rows 5–8 behind a `<details>` labelled `… 4 more commits` below 720px. (**I**)

### 7.3 Contact pane corrections
| tile | current | corrected |
|---|---|---|
| `gh` aqua | `https://github.com/its-everdred` | unchanged ✅ |
| `◆` purple | `https://github.com/its-applekid` | unchanged ✅ |
| `✉` | `href="#contact"`, title `kevin@kevinweaver.dev` | `href="mailto:notkevinweaver@gmail.com"`, title `notkevinweaver@gmail.com` |
| `@` | `href="#contact"`, title `@its_everdred` | `href="https://twitter.com/kevin_weaver"`, title `@kevin_weaver` |
| **new** `in` | — | `https://linkedin.com/in/kevinweaver`, `--blue` |
| **new** `www` | — | `https://kevinmweaver.com`, `--fg3` |

6 tiles × 34px + 5 × 12px gap + the `reach me` label ≈ 340px — still fits one row at 360px
if the label wraps above. Give each tile an `aria-label` (the `title` attribute alone is not
an accessible name for screen readers when the content is a bare glyph). (**I**)

---

## 8. Responsive behaviour

### 8.1 What the comp actually declares (M — comp:32-45, verbatim)
```css
@media (max-width:1080px){
  .kw-instr{height:auto !important;min-height:0 !important;}
  .kw-lower{flex-direction:column !important;flex:none !important;min-height:0 !important;}
  .kw-lower>.pane{flex:none !important;}
  .kw-graph{height:420px !important;flex:none !important;}
  .kw-tail{width:100% !important;flex:none !important;height:210px !important;}
  .kw-2up{grid-template-columns:1fr !important;}
  .kw-hide-md{display:none !important;}
}
@media (max-width:720px){
  .kw-hide-sm{display:none !important;}
  .kw-pad{padding:10px !important;}
  .kw-graph{height:340px !important;}
}
```

**Two breakpoints only: 1080 and 720.** Every rule needs `!important` purely because the
base values are inline styles — that disappears once §3.8 moves them to a stylesheet.

### 8.2 The breakpoint story, restated
| | ≥1081px (desktop) | 721–1080px (tablet) | ≤720px (phone) |
|---|---|---|---|
| `<main>` padding | 14px | 14px | **10px** |
| `.kw-instr` | `100vh − 60`, min 520 | **auto height** (scrolls) | auto |
| `.kw-lower` | row: graph `flex:1` + tail 320px | **column** | column |
| `.kw-graph` | fills (≈602px @1080p) | **420px fixed** | **340px fixed** |
| `.kw-tail` | 320px wide, full height | **100% wide, 210px tall** | same |
| `.kw-2up` | `1fr 2fr` grid | **1fr** (stacked) | stacked |
| header `<nav>` | 3 links | 3 links | **hidden** (`.kw-hide-sm`) |
| `HEAD → main` | shown | shown | **hidden** |
| tmux bar | 6 segments | 6 segments | 6 segments ⚠️ |

### 8.3 Gaps and fixes

1. **`.kw-hide-md` is defined but never applied.** (**M**, 0 markup matches.) Either delete
   it or use it — the obvious candidate is the tmux `kevinweaver.dev` segment and the
   contributions-pane right caption.

2. **No breakpoint below 720px.** Real phones are 360–430px. At 360px:
   - the **tmux bar overflows** (§3.6, needs ~470–515px) → **horizontal page scroll**.
     Fix: add `hideBelow` to `kevinweaver.dev` and `☰ 1826/1826`, and set
     `overflow-x:hidden` on `<body>` as a backstop.
   - `.commit` rows: `.graph 22 + .hash 92 + .cyear 88 + 3×24 gap = 274px` of fixed
     columns before `.cmsg` gets any width — leaving **~66px** for the message inside a
     360px viewport minus 10px×2 padding minus 2px×2 border. Unusable.
     **Fix: below 720px, restructure `.commit` as a 2-row grid:**
     ```css
     @media (max-width:720px){
       .commit{display:grid;grid-template-columns:auto auto 1fr;
               grid-template-areas:"graph hash year" "msg msg msg";
               gap:2px var(--sp-1);align-items:baseline;}
       .commit .graph{grid-area:graph;flex:none;}
       .commit .hash {grid-area:hash; flex:none;}
       .commit .cyear{grid-area:year; flex:none;margin-left:auto;}
       .commit .cmsg {grid-area:msg;  padding-left:calc(1.125rem + var(--sp-1));}
       .rail{margin-left:calc(1.125rem / 2 - 1px);height:12px;}
     }
     ```
   - the contact row (6 tiles + label) needs `flex-wrap:wrap`.
   - the contributions caption row (`now → 2021 · drag to scrub` / `◆ 29 jan 2026 · agent
     initialized`) is `justify-content:space-between` with `white-space` unconstrained →
     will wrap awkwardly. Hide the right half below 540px.

3. **`100vh` on mobile.** Root has `min-height:100vh` (comp:48) and `.kw-instr` has
   `height:calc(100vh - 60px)`. The latter is neutralised at ≤1080px, but the root is not.
   **Use `100dvh`** (or `100svh` for the instrument section if it is ever kept at phone size)
   — iOS Safari's collapsing URL bar otherwise adds ~60–110px of dead scroll.

4. **`.kw-graph` fixed heights fight the ring layout.** `ry = min(0.38, rpx/(H−74)*0.82)`:
   at `H=340`, `H−74 = 266`, so unless `rpx ≤ 123` the ellipse pins to `ry=0.38` and the
   repo ring becomes very flat while `rx` stays at 0.42 — labels collide.
   **Fix: below 1080px, drop to a reduced repo set** (top N by recent volume, plus the
   private cluster) so `need` and therefore `rpx` shrink. `N ≈ 8` at 720px. (**I**)

5. **The 1080px breakpoint collides with the `.kw-2up` grid ratio.** Going straight from
   `1fr 2fr` to `1fr` skips the obvious intermediate: at 721–1080px the man page and git log
   are both full-width, but the git log has 8 rows of 3 fixed columns and would be
   comfortable at `1fr 1.6fr`. **Add a 900px step** rather than collapsing at 1080.

6. **Drag-to-scrub is mouse-only.** `ov.onmousedown` + `window mousemove/mouseup`
   (comp:509-517). No `touchstart`/`pointerdown`. On a phone the overview strip is inert and
   `cursor:ew-resize` is meaningless. **Use Pointer Events** (`onpointerdown` +
   `setPointerCapture`) — one change covers mouse, touch and pen. Same for the ribbon hover
   tooltip, which should become tap-to-pin on touch.

7. **Recommended breakpoint set for the port:** `540` (phone→large phone),
   `720` (existing, phone→tablet), `900` (new, two-up ratio), `1080` (existing,
   stack→side-by-side), `1560` (max-width, no query needed).

### 8.4 Container queries would be better than any of this
Every one of these rules is really about *a pane's own width*, not the viewport. `.kw-2up`,
`.commit`, `.kw-tail` and the tmux bar are all self-contained. Container queries are
baseline-available in every browser Next 10 would target in 2026. **Recommend
`container-type:inline-size` on `.pane` and `@container` rules for `.commit` and the log**,
keeping viewport queries only for the page-level layout (`.kw-lower`, `.kw-2up`, `.kw-pad`).
(**I**)

---

## 9. Accessibility audit

All ratios below are **computed** (`/tmp/cr.js`, WCAG 2.x relative-luminance formula) —
not estimated. Reminder from §1.1: `.pane{background:var(--surface-pane)}` = **`#1d2021`**,
so the pane surface, not `#282828`, is the correct background for almost every pair.

### 9.1 Text contrast — the failures

| pair | ratio | size/weight | verdict | where |
|---|---|---|---|---|
| `#7c6f64` (bg4) on `#1d2021` | **3.37** | 9px 600 | ❌ **FAIL** (needs 4.5) | ribbon weekday labels `mon/wed/fri` (comp:583) |
| `#928374` (gray) on `#1d2021` | **4.47** | 9–11px | ❌ **FAIL** (just under 4.5) | ribbon month labels (595), overview year labels (558), `now → 2021 · drag to scrub` (77), `reach me` (164) |
| `#a89984` (fg4) on `#3c3836` (bg1) | **4.17** | 11px | ❌ **FAIL** | `⏮ 2021` transport control (111) |
| `#d3869b` (purple) on `#3c3836` | **4.23** | 11px | ❌ **FAIL** | `◆ init` transport control (112) |
| `#bdae93` (fg3) on `#504945` (bg2) | **4.05** | 11px | ❌ **FAIL** | tmux `☰ 1826/1826` segment (178) |
| `#8ec07c` (aqua) on `#3c3836` | 5.51 | 11px | ✅ AA | `⏭ live` (113) |
| `#bdae93` on `#3c3836` | 5.32 | 11px | ✅ AA | `12 days/sec` (114) |
| `#ebdbb2` (fg1) on `#665c54` (bg3) | 4.75 | 11px | ✅ AA (thin) | tmux ` main`, `100%` |
| `#a89984` on `#1d2021` | 5.90 | 10–11px | ✅ AA | nav idle links, graph legend |
| `#d5c4a1` (fg2) on `#1d2021` | 9.56 | 13px | ✅ AA | man-page prose |
| `#1d2021` on `#689d6a` (aqua-d) | 5.17 | 11px | ✅ AA | active nav item |
| `#1d2021` on `#8ec07c` (aqua) | 7.79 | 11px | ✅ AA | play button, tmux session/clock |

**Five failures, all in the 3.4–4.5 band.** Minimal fixes: `--gray → --fg4` (4.47→5.90 on
bg-h), `--bg4 → --fg4` for weekday labels (3.37→5.90), and lift the transport bar's
background from `--bg1` to `--bg-h` (fg4 4.17→5.90, purple 4.23→5.98) or its text from
`--fg4` to `--fg3` (4.17→5.32). For the tmux `☰` segment, swap `--fg3` on `--bg2` for
`--fg1` on `--bg2` (6.43) or `--fg3` on `--bg1` (5.32).

### 9.2 The scanline makes every ratio worse — quantified
The overlay is `rgba(0,0,0,.16)` at `opacity:.35` with `mix-blend-mode:multiply`, striped
1px on / 2px off. Effective multiplier on the *on* rows: `1 − 0.16·0.35 = 0.944`.
Computed impact (`/tmp/ramp.js`):

| pair | clean | on a scanline row |
|---|---|---|
| fg4 / bg1 (transport) | 4.171 | **3.905** |
| fg3 / bg2 (tmux pos) | 4.050 | **3.837** |
| gray / bg0 | 4.016 | **3.739** |
| bg4 / bg-h (weekday) | 3.369 | **3.146** |
| purple / bg1 (init) | 4.226 | **3.944** |
| fg1 / bg0 (body) | 10.747 | 9.798 |

So the borderline pairs are **~6–7 % worse than the table in §9.1 suggests**, and one third
of every glyph's pixel rows sits in that state. Two mitigations, pick one:
1. **Gate the scanline behind a toggle** (persisted in `localStorage`), default on; or
2. drop `--scanline-opacity` to `.20` and raise every failing pair to ≥5.0 clean, so the
   worst case stays ≥4.7.

`prefers-contrast: more` should disable the scanline unconditionally. (**I**)

### 9.3 Non-text contrast — the contribution grid
WCAG 1.4.11 requires **3:1** for graphical objects that convey information, against
adjacent colours. Measured (§6.3):

- **level 0 (`#32302f`) vs the pane surface (`#1d2021`): 1.25:1** — an empty day is nearly
  invisible against the pane. That is arguably fine (it *is* absence) but it means the grid
  has no visible extent.
- **level 1 vs level 0: 1.47:1** — the single most common non-zero state (156 of 370 days)
  is barely distinguishable from empty. ❌
- **level 1 vs the pane surface: 1.83:1** ❌
- adjacent-level ratios across the whole ramp: **1.22 – 1.47**, never reaching 3:1.

This is unavoidable for a 10-band sequential ramp — GitHub's own 5-band scale has the same
property — so **the fix is not to change the ramp, it is to provide a non-colour channel**:
1. the tooltip (already present) gives exact numbers on hover — but is mouse-only (§8.3.6);
2. add a **legend with the bin labels** (`this.BINS` already exists: `0 · 1 · 2–3 · … · 256+`)
   under the ribbon — the comp has a legend for the *graph* but none for the *grid*;
3. add a **1px `rgba(251,241,199,.10)` inner stroke on every level-0 cell** so the lattice is
   visible as a lattice; and
4. expose the whole grid as an accessible table (§9.5).

Also: the **agent band** (`day.g/day.t` of the cell height, `AG` ramp) is measured at
**1.07–1.18:1** against its own `LV` base at the same level. At level 1 (`#385027` vs
`#6a334c`, 1.07:1) the human/agent split is **invisible**. The comp mitigates with a
`rgba(29,32,33,.5)` 1px divider line, but only when `day.h > 0` (comp:608). **Recommend:
raise `agentEncoding:'band'` to also apply a 1px `--bg-h` separator unconditionally, and
offer `agentEncoding:'none'` (already a prop!) as the accessible default.**

### 9.4 Focus states — there are none
**(M)** `grep -noE 'focus-visible|outline|tabindex|aria-|role=|alt='` over the comp →
**zero matches**. Over all five DS layer files → `base.css` has `a{...}` and `a:hover{...}`
and **no `:focus` or `:focus-visible` rule anywhere in the design system.**

Worse, the comp's nav links set `border:none` inline, which removes `base.css`'s
`border-bottom` — the *only* non-colour affordance a link had. The active-section indicator
is applied by JS as `background:var(--aqua-d); color:var(--bg-h)` (comp:502-504), which is
also colour-only.

**Required:**
```css
:where(a, button, [tabindex]):focus-visible{
  outline: 2px solid var(--fg0);
  outline-offset: 2px;
  border-radius: var(--r-chip);
}
@supports not selector(:focus-visible){ :where(a,button):focus{ outline:2px solid var(--fg0); } }
```
`--fg0 #fbf1c7` is 14.45:1 on `#1d2021` and 10.22:1 on `#3c3836` — it works on every surface
in the system, which is why it is the right ring colour rather than `--accent`.

### 9.5 Semantics — the page has no headings and one button
**(M)** Element census over the comp:
```
4 <p>   3 <canvas>   1 <section>   1 <nav>   1 <main>   1 <header>   1 <em>   1 <button>
0 <h1>  0 <h2>  0 <h3>  0 <footer>  0 <ul>  0 <li>  0 alt=  0 aria-*  0 role=
```

| Gap | Fix |
|---|---|
| **Zero headings.** A screen-reader rotor shows nothing; SEO sees a resume with no title. | `<h1 class="sr-only">Kevin Weaver — Lead Fullstack Software Engineer</h1>`; each pane title becomes the `<h2>`/`<h3>` for its region (`man kevin-weaver`, `git log …`, `contributions`, `gource — repo graph`, `events`). Style them with `--fs-micro` so nothing changes visually. |
| **6 of 7 controls are `<span onClick>`** — `onSeek`, `onJumpStart`, `onJumpBirth`, `onJumpLive`, `onSpeed`, `onSkipBoot`. Not focusable, not keyboard-activatable, no role. | `⏮/◆/⏭/speed/skip` → `<button>`. The seek track → `<input type="range" min=0 max={N-1}>` visually restyled, which gets arrow-key seeking, `aria-valuetext` and drag for free. |
| **`Space` is `preventDefault`ed on `window`** (comp:478-482) for the cut Bomberman. Blocks button activation *and* page-down. | Delete with §4.7; then rebind `Space` to play/pause **scoped to the transport region**, not `window`, and skip when `document.activeElement` is a form control. |
| **3 `<canvas>` with no fallback, no `role`, no label.** | Each gets `role="img"` + `aria-label` (e.g. `"Contribution grid, 53 weeks ending 31 July 2026. 4,817 contributions."`), and the ribbon additionally gets a visually-hidden `<table>` sibling with one row per week — the standard accessible-chart pattern. The gource canvas gets a text summary that updates as `graphDateRef` does. |
| **The event log is a live region that isn't announced.** `pushLog` appends DOM nodes at up to ~3/sec. | `aria-live="polite"` would be a firehose. Use `aria-live="off"` + a separate `role="status"` element that announces only *state* changes (`playing 2023`, `paused`, `reached 2021`). |
| **The tmux bar is a `<div>`.** | `<footer>` + `role="contentinfo"`; the `☰ 1826/1826` and `100%` segments are progress readouts → `role="progressbar"` with `aria-valuenow`. |
| **The `<sc-if>` boot overlay is a modal that traps nothing.** | `role="dialog" aria-modal="true"`, focus the skip control on mount, restore focus on dismiss, `Esc` to skip. Or: since it is default-off and purely decorative, mark it `aria-hidden="true"` and make it click-through for AT. |
| **Contact tiles are bare glyphs with `title` only.** `title` is not a reliable accessible name. | `aria-label="GitHub — its-everdred"` etc. |
| **`<i>` used as a decorative box** in `.dots`, the pill dot, and the legend swatches. | `aria-hidden="true"` on all of them, or switch to `<span>`; `<i>` carries an implicit "emphasis" semantic. |
| **Skip link missing.** The first tab stop is a nav link, but the instrument section is ~600px of canvas. | `<a class="skip" href="#whoami">skip the animation</a>` as the first focusable element. |

### 9.6 Motion — mostly good, three holes
**(M)** The comp checks `matchMedia('(prefers-reduced-motion: reduce)')` at construction
(comp:205) and, when set: never shows boot, never starts the rAF loop, never starts the
2600 ms live interval, calls `settleStatic()` to paint the final state once, sets the pill
to `static`, and disables `kw-pulse`. **That is a genuinely good reduced-motion story.**

Three holes:
1. **The media query is read once, in the constructor.** A user toggling the OS setting mid-session
   gets no change. Use `matchMedia(...).addEventListener('change', …)`.
2. **`tickClock()` only runs inside the rAF loop**, so under reduced motion the tmux clock
   is frozen at the markup literal `09:41` forever. Move it to a 30 s `setInterval` that runs
   in both modes (or drop the clock — it is the one element that must move to be truthful).
3. **`settleStatic()` still calls `pushLog()` twice** (comp:467-468), which applies
   `animation:kw-logIn .25s ease both`. Two 250 ms slides is trivial, but it should be gated.

Additionally, the DS itself has **five unconditional infinite animations** that are *not*
inside the `prefers-reduced-motion: no-preference` guard (**M**, `type.css` and `base.css`):
`.rainbow` (`rainbow-pan 18s`), `.hl` (`rainbow-pan 16s`), `.uhl` (`uhl-pan 16s`),
`.cursor` (`blink 1.1s`), `.glow` (`glow-drift 26s`). Only `.reveal.anim` and
`.meter .fill.anim` are correctly guarded. The comp uses none of the five today, but any
future use inherits the bug. **Fix at the DS level with a global stop:**
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important;
  }
}
```

### 9.7 Other
- **Root `font-size:13px`** (comp:48) is an absolute px on the app root. A user whose browser
  base font is 24px sees no difference. §5 fixes this by moving to `rem` + `clamp`.
- **`min-width` for reflow (WCAG 1.4.10):** at 320px the tmux bar overflows (§8.3.1) →
  horizontal scrolling on a full page. That is a Level AA failure, not a nit.
- **Text spacing (WCAG 1.4.12):** many one-line elements are `white-space:nowrap` with fixed
  heights (`.pane-bar{height:var(--bar-h);overflow:hidden}`, `.tmux .seg`, log lines with
  `text-overflow:ellipsis`). Applying the 1.5× line-height / 0.12em letter-spacing bookmarklet
  will clip the pane bars. Change `height` to `min-height` on `.pane-bar` and `.tmux`.
- **`::selection{background:#8ec07c;color:#1d2021}`** = 7.79:1. ✅
- **Scrollbar `#504945` thumb on `#1d2021` track** = 2.24:1 — below the 3:1 UI-component
  requirement. Lift the thumb to `--bg3 #665c54` (3.35:1) or `--bg4 #7c6f64` (4.63:1).

---

## 10. Port plan — recommended file layout (Next.js Pages Router, unchanged infra)

```
public/fonts/jetbrains-mono-latin.woff2            ← from DS assets/fonts (2 files, not 12)
public/fonts/jetbrains-mono-latin-ext.woff2
styles/tokens.css        ← colors + the §5 clamp scale + §5.3 geometry (replaces 5 token files)
styles/ds.css            ← pane / tmux / data layers, web-re-derived (replaces 3 layer files)
styles/kw.css            ← .kw-* layout, media queries, keyframes, focus ring, a11y utils
components/ds/{Pane,PaneBar,TmuxBar,CommitLog,Meter,Scanline}.jsx
components/kw/{StatusPill,TransportBar,EventLog,BootConsole,CanvasPane,
               ContribTooltip,GraphLegend,ManPage,ContactTiles}.jsx
components/kw/instrument/{Overview,Ribbon,Gource}.jsx   ← one canvas each
lib/viz/{colors.js,level.js,layout.js,playback.js,draw-*.js}   ← the 800 lines of comp JS
lib/viz/useRafLoop.js    ← single rAF, dt-corrected (§4.4), reduced-motion aware
data/                    ← DATA track owns this
pages/index.js
```

Splitting the three canvases into three components each owning its own `ResizeObserver` +
DPR sizing is the single biggest structural improvement over the comp, where `sizeAll()`
loops over all three refs at once (comp:520-529) and `drawAll()` repaints all three
regardless of what changed (comp:1029).

---

## 11. Open questions
1. **Repo list ownership.** The comp's 19-repo array is hand-authored and partially wrong
   (§7.0). Does the DATA track emit it, and with what shape (`{id, short, actor, vol, stars,
   from, to, private, ext[]}` is what the renderer needs)?
2. **Does the private cluster stay one circle or become N circles?** The comp models it as
   a single repo with `vol:5271` and 26 dotted files. The measured private totals are
   per-year (105/86/1028/2360/998), so a per-year private blob is also possible.
3. **Is the `live` pill kept as `fresh · Nh ago` (§4.8) or removed entirely?**
4. **Scanline: toggle, or reduce to `.20` opacity?** (§9.2) — affects five contrast pairs.
5. **Phone number:** publish, gate, or omit? (§7.1)
6. **Ribbon height:** keep 140px with anisotropic cells, or grow to `clamp(120px,20vh,200px)`
   for square cells? (§6.2)
7. **`packSiblings` vs the comp's radial spokes** for file layout (§6.4) — 35 KB and true
   containment vs 30 lines and spokes.
8. **`--fs-hero`/`--fs-stat` have no home in the current comp.** Is there a hero stat block
   (`10,001 contributions`) that the design should gain, or should those steps be deleted?

---

## Verification corrections

Adversarial re-verification pass, 2026-07-31. Every item below was independently re-measured
against `docs/design/kevinweaver.dev.dc.html`, the DS files on disk, and the live `DesignSync`
project `583945d5-2203-4320-8a4e-b30afe61181d`. Commands are quoted. The original sections are
left untouched; corrections live here.

**Overall:** the measurement discipline in this doc is real. I reproduced, byte- or
digit-identically: the class census, the zero-usage class list, `grep -c transition` = 0, the
element census, the a11y grep (0 matches), 18 ref bindings, `N = 1826`, `speeds = [4,8,12,20,32]`,
`BINDAYS` summing to 370, the `level()` ladder, **the entire 10-step OKLCh `LV`/`AG` ramp**
(re-ran the comp's own `oklch()` — all 20 hexes match), all 12 contrast ratios in §9.1 to three
decimals, the scanline degradation table (within rounding), the contact-tile hrefs/titles/colours,
`Space` `preventDefault` being unconditional, boot defaulting off, `init()` seeding from `N-40`,
`Pane.jsx`'s exact signature, and `CommitLog.jsx` hardcoding `.hash` to `var(--yellow)`.
`npm view @fontsource/jetbrains-mono version license` → `5.3.0` / `OFL-1.1` ✅.

The corrections below are the exceptions.

### C1 — §0 / claim "all 10 DS CSS files recovered and quoted verbatim" is **false**

- **`tokens/fonts.css` is not on disk.** `find docs/design/_ds -type f` returns **9** files, not 10:
  `layers/{base,pane,tmux,type,data}.css` + `tokens/{colors,typography,spacing,effects}.css`.
  `tokens/fonts.css` is missing.
- **`tokens/fonts.css` is not quoted anywhere in this doc.** `grep -n "fonts.css"` → 2 hits, both
  prose. (I did fetch it via `DesignSync get_file` and the doc's *description* of it is accurate:
  12 `@font-face`, `font-weight:300 800`, 6 roman + 6 italic-400 subsets. But describing ≠ quoting,
  and a ticket that needs the file still has to fetch it.)
- **`layers/base.css` and `layers/type.css` are also not quoted verbatim**, despite §3's blanket
  "All CSS below is **verbatim (M)** from the fetched DS files". §3 quotes only pane/data/tmux.
- **§3.7's "verbatim" `.ph` block is not verbatim.** The real rule opens
  `.ph{position:relative;background:var(--surface-pane);background-image:…}` and is followed by a
  `.ph span{…}` rule. Both were dropped from the quote.
- **§2.0 "11 stylesheet links" is wrong — there are 10.**
  `grep -c '<link rel="stylesheet"' kevinweaver.dev.dc.html` → **10**.
- `DesignSync list_files` also shows a root **`styles.css`** in the project that this doc never
  mentions; worth a look before declaring the DS surface closed.

### C2 — §0 "the site only needs latin + latin-ext" misses every icon glyph

Measured: I enumerated every codepoint > U+2000 in the comp and tested it against the
`unicode-range` of each `@font-face` in `tokens/fonts.css`.

**11 distinct glyphs / 33 occurrences fall outside *both* `latin` and `latin-ext` — and outside
every other subset in the file:**

```
◆ U+25C6 ×7   ● U+25CF ×5   → U+2192 ×3   ⏸ U+23F8 ×2   ☰ U+2630 ×2
⠿ U+283F ×2   ◉ U+25C9 ×2   ⏮ U+23EE ×1   ⏭ U+23ED ×1   ✉ U+2709 ×1
★ U+2605 ×1   ▶ U+25B6 ×1
```

Note especially **U+2192 `→`**: the `latin` range enumerates `U+2191` and `U+2193` but **skips
`U+2192`**, so `HEAD → main`, `now → 2021` and every `repo → file` log line render from the
fallback stack. So do the entire transport control set (`⏸ ▶ ⏮ ⏭`), the agent diamond `◆`, the
tmux `☰`, the boot spinner `⠿`, the contact `✉` and the star `★`.

Only `— U+2014`, `– U+2013` and `• U+2022` are actually covered by the `latin` subset.

Pulling the 2 woff2 subsets is still correct, but it does **not** solve this — the DS's JetBrains
Mono has no coverage for any of it. **This is a real ticket the doc does not have:** an icon
strategy (inline SVG, or a documented `font-family` fallback + a cross-platform tofu check).
It is the same failure mode §0 correctly warns about for the powerline U+E0B0 separators.

### C3 — §4.3 the chunk table is arithmetically broken (the headline number is fine)

`365 / 12 = 30.4 s` and `365 / 32 = 11.4 s` are correct — **"one 365-day chunk buys ~30 s of
runway at the default speed" stands.** The table underneath it does not:

- The chunks **do not tile the corpus**. `90 + 366 + 365 + 365 + 366 = 1552` of `N = 1826` days.
  Days **1462–1735 (274 days) appear in no chunk.**
- Every "covers playback seconds" figure is wrong. Playback starts at `day = N-1 = 1825` and
  decrements, so chunk `[a,b]` is consumed over `t ∈ [(1825−b)/12, (1825−a)/12]`:

| chunk | days | doc says | actually |
|---|---|---|---|
| `recent.json` | 1736–1825 | 0 – 7.5 s | 0 – 7.5 s ✅ |
| `y-2025.json` | 1096–1461 | 7.5 – 38 s | **30.3 – 60.8 s** |
| `y-2024.json` | 731–1095 | 38 – 68 s | **60.8 – 91.2 s** |
| `y-2023.json` | 366–730 | 68 – 98 s | **91.3 – 121.6 s** |
| `y-2021-22.json` | 0–365 | 98 – 152 s | **121.7 – 152.1 s** |

- The "must arrive by" column follows the same error and is uniformly optimistic.
- **Additional scoping correction:** "no ticket should budget for reversing the animation" is
  right about the *direction*, but the comp's backwards walk runs over a **fully pre-built
  in-memory corpus** (`buildData()` builds all `N` days at construction). Three call sites need
  real work before newest-first streaming is possible: `buildData()` (comp:351-376),
  `drawOverview()` (needs all `N` day totals on frame 1), and `settleStatic()` (comp:463-464,
  the reduced-motion path, which iterates `i = 0 … N` immediately). The doc's own §4.3 conclusion
  — ship the totals array eagerly, event detail lazily — is the right answer; the point is that
  it is not zero work.

### C4 — §7.0 "100% of the comp's resume copy is placeholder that contradicts the resume"

Confirmed and unchanged: `grep -ic optimism` → **0** (the current employer is genuinely absent);
`title="kevin@kevinweaver.dev"` and `title="@its_everdred"` are both wrong and both `href="#contact"`;
the comp has exactly **5** `.commit` rows.

Corrections:

- **Not 100%.** This doc's own §7.0 table marks `2021–22 consensys · truffle` as ✅ correct, and
  §7.3 marks both GitHub tiles as correct and unchanged. The accurate framing is *"every era row
  except ConsenSys is wrong or missing, and the two non-GitHub contact facts are wrong."*
- **"5 rows → 9" is wrong; §7.2's own table has 8 rows.** The heading says 9, the table is
  numbered 1–8. Fix the heading (or add the missing 9th row and say what it is).
- §7.2 row 2 says `1,486 contributions in six months`; the comp (and §2.5.2) says **five**.
  Ground truth has `its-applekid` created **2026-01-29**, so at 2026-07-31 six months is right —
  but the doc changes a comp literal without flagging it as a change.
- §7.3 corrects the email to `mailto:notkevinweaver@gmail.com`. The authoritative resume says
  `notkevinweaver@gmail` with **no TLD**. Appending `.com` is an unmarked **(I)**. Confirm with
  the user before shipping a `mailto:`.

### C5 — §1.1 / §9: the `#1d2021` finding is correct; the "masks two failures" claim is backwards

**Confirmed verbatim** (`tokens/colors.css:22`, `:5`, `layers/pane.css:4`):
`--surface-pane:var(--bg-h)` and `--bg-h:#1d2021`, and `.pane{…background:var(--surface-pane);…}`.
All 12 ratios in §9.1 reproduce exactly. That part is solid.

Three corrections:

1. **"Computing against `#282828` … would mask two of the five measured failures" is inverted.**
   `#282828` is *lighter* than `#1d2021`, so every light-on-dark ratio gets **smaller**, not larger:

   | pair | on `#1d2021` | on `#282828` |
   |---|---|---|
   | `#928374` gray | 4.467 ❌ | **4.016** ❌ (worse) |
   | `#7c6f64` bg4 | 3.369 ❌ | **3.029** ❌ (worse) |
   | `#a89984` fg4 | 5.898 ✅ | 5.304 ✅ |
   | `#d5c4a1` fg2 | 9.556 ✅ | 8.593 ✅ |

   Using the wrong surface **masks nothing** — it exaggerates the failures. And the other three of
   the five failures (`fg4/bg1`, `purple/bg1`, `fg3/bg2`) sit on `--bg1`/`--bg2` and are untouched
   by the `bg-h` vs `bg0` question entirely. **Net effect of the error on pass/fail verdicts:
   zero.** The distinction changes *how far under* threshold a pair is, not *whether* it fails.
   Keep `#1d2021` as the correct surface; drop the claim that it changes any verdict.

2. **"Almost every pixel of text sits on `#1d2021`" overstates it.** `pane.css` sets
   `.pane-bar{background:var(--surface-bar)}` = `--bg1 #3c3836`. All **six** pane bars, the 38px
   transport bar and the tmux bar are on `#3c3836`/`#504945`, not `#1d2021`.

3. **A sixth contrast failure the audit missed.** `pane.css` line 6:
   `.pane-bar{…color:var(--text-faint);…}` = `--fg4 #a89984` on `--surface-bar #3c3836` =
   **4.17:1 ❌**. That is the *default* colour of every pane bar, and the comp re-applies it
   explicitly at comp:147 (`<span style="color:var(--fg4)" class="kw-hide-sm">HEAD → main</span>`).
   Add it to the §9.1 table; the fix is the same as the transport bar's
   (`--text-faint` → `--text-dim`, 4.17 → 5.32).

### C6 — §9.7 the scrollbar numbers are wrong, and the recommended fix does not clear 3:1

Comp:26-27 — track `#1d2021`, thumb `#504945`. Recomputed with the WCAG 2.x relative-luminance
formula:

| pair | doc says | measured |
|---|---|---|
| `#504945` on `#1d2021` (current) | 2.24 | **1.86** |
| `#665c54` (`--bg3`) on `#1d2021` | 3.35 | **2.52** ❌ still under 3:1 |
| `#7c6f64` (`--bg4`) on `#1d2021` | 4.63 | **3.37** ✅ |

Note this contradicts §9.1 *inside the same doc*, which correctly lists `#7c6f64` on `#1d2021`
as **3.37**. **Only `--bg4` clears 1.4.11; `--bg3` does not.** Drop the `--bg3` option.

### C7 — §9.6 "five unconditional infinite animations" is **six**

`.rainbow` and `.hl` and `.uhl` and `.cursor` (`layers/type.css:5,8,12,20`) and `.glow`
(`layers/base.css`) — plus a sixth in `layers/data.css`:

```css
.metric.rainbowfill .meter .fill{…animation:rainbow-pan 16s linear infinite;}
```

which sits **outside** the `@media (prefers-reduced-motion:no-preference)` block immediately below
it (only the `.anim` variants are inside). The recommended global stop in §9.6 covers all six.

### C8 — items confirmed but worth re-stating as scoping caveats

- **§1's "19 DS classes" is exactly right** (my census reproduces all 26 distinct classes and the
  7 `kw-*`). But the comp's DS *dependency* is larger than 19 classes: it also relies on
  `base.css`'s `*{box-sizing:border-box}` reset and `a{}`/`a:hover{}` element rules, and on
  `effects.css` tokens (`--scanline`, `--shadow-focus`, `--shadow-inset-track`) plus the whole of
  `colors.css` / `typography.css` / `spacing.css`. The "3 output CSS files" target in §10 is still
  the right shape; the "3 CSS files" shorthand in a ticket summary is not.
- **§4.3's playback mechanism is confirmed verbatim** (comp:451 `this.day = this.N - 1`;
  comp:887 `this.day = Math.max(0, this.day - sp * dt)`; comp:896 wrap at `<= 0`). The comment at
  comp:876 even says *"park on today, stream, then start walking backwards through history."*
