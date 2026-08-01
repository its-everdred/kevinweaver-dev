# Visualization runtime — contribution grid + reverse Gource

Date: 2026-07-31. Track owner: viz runtime.
**(M)** = measured on this machine with the command shown. **(I)** = inference from measured values.
Everything unmarked is a design decision, not a fact.

Measurement environment: Chromium 150.0.7871.128 / `chrome-headless-shell` 1228 (Playwright),
**software rasterization (SwiftShader, no GPU)**. Absolute canvas timings are therefore a
**pessimistic upper bound**; a GPU-composited browser will be faster. All *ratios* between
techniques hold. Every canvas benchmark forces synchronous rasterization with
`ctx.getImageData(0,0,1,1)` after each iteration — without that flush Chromium defers the
command buffer and every number reads `0.0000 ms` (verified: `/tmp/vizbench/b4.html` vs
`b5.html`). Benchmark sources: `/tmp/vizbench/b{2,3,4,5,6}.html`.

---

## 0. The design file is already a working prototype — read it before writing code

`/home/everdred/github/everdred/kevinweaver-dev/docs/design/kevinweaver.dev.dc.html` is not a
mock. It contains a complete, runnable Canvas 2D implementation of both the contribution
ribbon and the Gource graph. **(M)** — `grep -n -iE 'gource|contribution|canvas'` returns
three live `<canvas>` elements (lines 76, 83, 97) and ~700 lines of render code.

Load-bearing consequences:

- **The design already runs backwards.** Line 451 `this.day = this.N - 1;` and line 887
  `this.day = Math.max(0, this.day - sp * dt);` **(M)**. Reverse playback is not a new
  requirement to bolt on; it is the prototype's existing behaviour. Line 896 wraps to today
  when it reaches 2021-08-01.
- **Three canvases, not one.** `overRef` (5-year overview strip, 50px tall), `ribbonRef`
  (371-day detail ribbon, 140px), `graphRef` (the Gource graph). The prior research doc's
  "single Canvas 2D" is wrong for the grid — see §3.
- The prototype **does not use `d3-force`**. Repos are placed on a deterministic ellipse by
  sorted index (lines 728–744) **(M)**. See §2 — this is better than force and should be kept.
- The prototype **does not use GSAP or any tween library**. All motion is exponential
  smoothing `x += (tx - x) * 0.045` and linear life decay **(M)**. See §10.
- The prototype's ramp is **already a 10-stop OKLCH green ramp** (lines 241–248) **(M)**.
- **Everything the Bomberman cut removes is in `drawGame()` (lines ~638–685) and the entire
  `keydown` handler (lines 477–491)** **(M)**. Deleting the game deletes the only keyboard
  handling that exists. §9 has the replacement.

### Nondeterminism already present in the prototype (M)

| Source | Count | Where |
|---|---|---|
| `Math.random()` | 6 | `emitDay`, `logLine`, `drawGame` |
| `performance.now()` | 5 | `drawGame`, ribbon live-pulse, keydown |
| `Date.now()` / `new Date()` | 4 | clock segment, data build |

`grep -c 'Math\.random' docs/design/kevinweaver.dev.dc.html` → 6.
Every one of these must go before Playwright can screenshot a deterministic frame (§8).

---

## 1. Reverse playback — the state model

### 1.1 Pick the semantics first, because they are not the same thing

Three candidate meanings of "backwards", only one of which matches the brief:

| Semantics | visible(e, T) | Screen as T → past |
|---|---|---|
| **A. Snapshot scrub** | `birth(e) ≤ T` | Empties out. 2021 shows ~nothing. |
| **B. Reverse accumulation** (prototype today) | `∃ touch(e) ≥ T` — union, never removed | Grows monotonically; by 2021 it still shows `its-applekid/vector-eth`, which did not exist. Wrong. |
| **C. Lifespan stabbing** ← **choose this** | `birth(e) ≤ T ≤ death(e)` | Old repos **appear** as you walk back into their active era; young repos **disappear** when you pass below their birth. |

The prototype implements B: line 464 `f.seen = true` and line 723 `r.entered = true` are set
and never cleared **(M)**. That is the single behavioural change this track owns.

C is exactly the brief: *"must APPEAR as you walk back (they were created earlier) and
DISAPPEAR (they were created later than the current cursor)"*. `ConsenSys/truffle`
(lifespan 2021-08 → 2022-09) appears at T = 2022-09 and disappears at T = 2021-08.
`its-applekid/vector-eth` (2026-03 → now) is on screen at T = now and vanishes at T = 2026-03.
The "longer you stay, the further back you see" property is preserved because the *set of
distinct repos the visitor has been shown* is monotone even though the *on-screen* set is not.

`death(e)` = last touch + a dwell tail (see §1.6), `+∞` for still-active entities.
This makes visibility a **pure function of T** — no history, no replay, no hysteresis.
That single property is what makes §8 (deterministic screenshots) possible at all.

### 1.2 Neither "seed from newest and remove" nor "replay forward and scrub" — both, driven by two monotone pointers

The question posed is a false dichotomy. Because T decreases **monotonically**, C decomposes
into two independent monotone crossings:

- `e` **enters** the live set when `T` crosses down through `death(e)`.
- `e` **leaves** the live set when `T` crosses down through `birth(e)`.

Both pointers only ever move forward over the run. Total work for a full 5-year pass is
`O(n)` inserts + `O(n)` deletes, no rescans.

```
seed:  live = { e : birth(e) ≤ T0 ≤ death(e) }        // T0 = today; this IS the newest snapshot
       byDeath = entities sorted death DESC           // static, precomputed, ships in payload order
       pd = index of first e with death(e) < T0
       births = max-heap over live, keyed by birth(e) // dynamic, live-set-sized only

step(T):                       // T strictly decreasing
  while pd < n && death[byDeath[pd]] >= T:            // ENTER
      e = byDeath[pd++]
      if birth[e] <= T: liveAdd(e); births.push(e)
  while births.size && birth[births.peek()] > T:      // LEAVE
      liveRemove(births.pop())
```

`liveAdd`/`liveRemove` are the ECS swap-remove pattern: a dense `Int32Array` of live ids plus
a `slot: Int32Array` index map, both `O(1)`.

**Why a heap for births and a sorted array for deaths, and not two sorted arrays.** The death
order is *static* and — critically — **is the chunk order**. If the payload is cut into
reverse-chronological time slices, a slice covering `[t0, t1)` contains exactly the entities
whose `death ∈ [t0, t1)`. So the enter-queue is naturally chunk-local and streams for free,
which is what makes "recent data is first-byte, history lazy-loads" work. The birth order is
*not* chunk-local: an entity born 2021 and still alive today lives in the newest chunk. But
its `birth` field is already in hand the moment it is activated, so a max-heap keyed on
`birth` over **the live set only** is sufficient. Heap size is bounded by the live set, not by
`n`.

### 1.3 Measured cost and memory (M)

Synthetic corpus at the measured real scale — 7,354 entities (7,334 unique files from the
blobless-clone measurement + ~20 repos), 1,826 days:

```
node -e '<two-pointer + max-heap reverse pass, /tmp>'
  full 1826-day reverse pass (2ptr+heap):  0.770 ms total  = 0.42 us/day
  adds: 7354   removes: 7347   max concurrent live: 869
  O(n) full seek scan n=7354:              0.0097 ms
  typed-array state for 7354 entities:     172.4 KB
  bitset checkpoint (one): 920 bytes; 20 checkpoints: 18.0 KB
```

- **Steady-state cost is 0.42 µs per simulated day.** At the prototype's fastest speed
  (32 days/s, line 209 `this.speeds = [4, 8, 12, 20, 32]` **(M)**) that is **13 µs/s** —
  0.0008 % of a 60 fps budget. Reverse playback is free.
- **Do not build checkpoints.** A brute-force `O(n)` rescan for an arbitrary seek is
  **9.7 µs** **(M)**. The 18 KB of checkpoint bitsets buys nothing. Seek = rescan, done.
  This kills a whole class of payload complexity.
- **Peak live set 869 entities** in the synthetic model, and the corpus never exceeds ~2,500
  files in one repo. Budget the renderer for **2,000 concurrent file circles** (§7).
- Resident state is **172 KB of typed arrays** for the whole 5 years. Nothing is streamed out
  of necessity; streaming is purely a first-byte optimisation.

**Memory profile summary:** `O(n)` flat typed arrays for the entity table (172 KB), `O(live)`
for the heap and dense array (~7 KB at 869 live), `O(1)` per frame. No per-frame allocation.
No history buffer. No forward replay. The reverse pass allocates nothing after boot.

### 1.4 Layout must be computed once, over the union — not per set-change (M)

This is the second load-bearing consequence and it is not obvious.

```
node --input-type=module -e '<d3-hierarchy packSiblings bench>'
  packSiblings n=20    0.0449 ms      packSiblings n=1000   0.8128 ms
  packSiblings n=300   0.1647 ms      packSiblings n=2500   2.9807 ms
  one-time pack of ALL 9480 files across 20 repos:  7.99 ms
```

The reverse pass produces **8.05 set-changes per simulated day** (14,701 total / 1,826 days)
**(M)**. At 12 days/s that is ~96 set-changes/s. Repacking `aiur` (2,487 files) on each would
cost `2.98 ms × 96 = 286 ms of CPU per wall-clock second` **(M)** — 29 % of a core, for
layout alone, and it would make circles jump because `packSiblings` is not stable under
insertion.

**Therefore: pack once at load over the union of every file that ever existed, per repo.
7.99 ms, one time.** Visibility is an alpha/scale channel on a fixed position, never a
re-layout. Positions are then trivially deterministic and the "pack is unstable under
insertion / tween to new targets" hazard from the prior doc **disappears entirely** rather
than needing mitigation.

### 1.5 What reverses and what does not

| Quantity | Direction | Note |
|---|---|---|
| Data cursor `T` | **backwards** in data-time | `T -= speed * dt` |
| Visibility | pure `f(T)` | reversible, scrub-safe |
| Beam life, heat decay, appear/disappear tweens | **forwards** in wall-clock | a beam always fades *out*, never in |
| Actor token position | forwards, chases target | target set by the day's events |

Beams and heat are *presentation* of a data event, not data. They decay forward regardless of
cursor direction. Keeping this split explicit is what stops the whole thing becoming a
time-travel paradox: **data-time is reversible and stateless; wall-clock effects are
forward-only and live in the sim's fixed-timestep integrator** (§2).

### 1.6 Two details that will bite

- **`death` needs a dwell tail.** A repo whose last touch is day D pops out of existence the
  instant `T < D` if `death = D`. The prototype already softens this (`d <= r.to + 90`,
  line 714 **(M)**). Use `death = lastTouch + 30 days` for files, `+ 90 days` for repos, and
  fade alpha over the tail rather than hard-cutting.
- **Reverse playback shows effects before causes.** Walking back, a file's *last* edit is seen
  first and its *creation* last. That is the intended narrative ("archaeology"), but the
  commit log panel must be labelled so it does not read as a bug. The prototype's date header
  (`graphDateRef`, line 94 **(M)**) counting *down* is the affordance; keep it and add an
  explicit `◀ rewinding` indicator.

---

## 2. sim / render split

### 2.1 Module boundary

```
src/viz/
  sim/            no DOM, no canvas, no window, no Date, no Math.random. Pure.
    state.ts      createState(payload, seed) -> State   (typed arrays, allocated once)
    step.ts       step(state, dtFixed) -> void          (mutates in place, no alloc)
    rng.ts        seeded xorshift128+, state carried IN State
    cursor.ts     the two-pointer + heap of §1.2
    layout.ts     packOnce(state)  — the only d3-hierarchy call site
  render/         reads State, writes pixels. Never mutates State.
    graph.ts      the Gource canvas
    ribbon.ts     371-day detail grid
    overview.ts   1826-day strip
    sprites.ts    text->bitmap sprite rasterizer (§5)
  driver.ts       rAF loop + accumulator; the ONLY file that touches performance.now()
```

Enforcement: an ESLint `no-restricted-globals` rule on `src/viz/sim/**` banning
`window, document, performance, Date, Math.random, requestAnimationFrame`. A CI unit test
imports `sim/` in plain Node (no jsdom) and runs 10,000 steps; if it throws, the boundary
leaked.

### 2.2 State shape

Structure-of-arrays, allocated once, zero per-frame garbage.

```ts
interface State {
  // ---- deterministic clock ----
  tick: number          // integer, count of fixed steps taken. THE canonical clock.
  cursor: number        // day index, float, decreasing.  cursor = f(tick) when playing
  playing: boolean
  speed: number         // days per simulated second; one of [4,8,12,20,32]

  // ---- rng, carried in state ----
  rng: Uint32Array      // length 4, xorshift128 internal state. Serializable.

  // ---- entities (parallel arrays, length nEnt = repos + files) ----
  birth:  Int32Array    // day index
  death:  Int32Array    // day index, 0x7fffffff for alive
  repoOf: Int32Array    // -1 for repos themselves
  px: Float32Array      // packed position, repo-local. Written ONCE by packOnce().
  py: Float32Array
  pr: Float32Array      // packed radius
  heat:  Float32Array   // 0..1, decays forward in wall-clock
  alpha: Float32Array   // 0..1, appear/disappear tween

  // ---- live set (ECS swap-remove) ----
  live: Int32Array      // dense
  slot: Int32Array      // entity id -> index in live, -1 if not live
  nLive: number
  pDeath: number        // monotone pointer into byDeath
  byDeath: Int32Array   // static, precomputed
  birthHeap: Int32Array // max-heap of live ids keyed by birth[]
  nHeap: number

  // ---- repos (small, ~20) ----
  repoAngle: Float32Array   // deterministic ring slot
  repoX: Float32Array; repoY: Float32Array   // smoothed toward ring slot
  repoR: Float32Array
  repoAlpha: Float32Array

  // ---- actors ----
  actor: { x: number; y: number; tx: number; ty: number }[]  // [human, agent]

  // ---- beams: ring buffer, fixed capacity, never grows ----
  beam: { ent: Int32Array; actor: Uint8Array; kind: Uint8Array; life: Float32Array }
  beamHead: number      // MAX_BEAMS = 256
}
```

Note what is **absent**: no `Map`, no object arrays for files, no closures over DOM refs, no
`seen` boolean (replaced by `slot[i] !== -1`). The prototype's `r.files.forEach` over plain
objects (line 795 **(M)**) is the thing being replaced.

### 2.3 Fixed-timestep accumulator

```ts
const FIXED = 1 / 120;      // s. 120 Hz sim, decoupled from display refresh.
const MAX_STEPS = 8;        // spiral-of-death clamp: never simulate > 66ms of catch-up

let acc = 0, prev = performance.now();

function frame(now: number) {
  let dt = (now - prev) / 1000; prev = now;
  if (dt > 0.25) dt = 0.25;                 // tab was backgrounded; do not fast-forward
  acc += dt;
  let n = 0;
  while (acc >= FIXED && n < MAX_STEPS) { step(state, FIXED); acc -= FIXED; n++; }
  if (n === MAX_STEPS) acc = 0;             // drop the backlog, do not accumulate debt
  render(state, acc / FIXED);               // alpha for interpolation, render never mutates
  raf = requestAnimationFrame(frame);
}
```

`step()` takes **no wall-clock argument**. It advances `state.tick++` and derives everything
from `FIXED`. Consequences:

- `cursor -= speed * FIXED` — cursor is an exact function of `tick`, so
  `cursor(tick) = cursor0 - speed * FIXED * tick` and any frame is reproducible from an
  integer.
- Heat decay is `heat[i] *= HEAT_DECAY_PER_STEP` where
  `HEAT_DECAY_PER_STEP = Math.pow(0.5, FIXED / HALF_LIFE_SECONDS)` — framerate-independent,
  unlike the prototype's `f.heat *= 0.955` per *rendered* frame (line 797 **(M)**), which
  decays 2× faster on a 120 Hz display than on 60 Hz.
- Same fix for repo easing: the prototype's `r.px += (r.gx - r.px) * 0.045` (line 749 **(M)**)
  is refresh-rate-dependent. Replace with `1 - Math.pow(1 - 0.045, FIXED * 60)`.

Render receives the interpolation alpha but for v1 should **ignore it** (render at `tick`
state). Interpolated rendering makes screenshots depend on sub-step phase; add it only if
120 Hz sim proves visually insufficient, and gate it off in test mode.

### 2.4 Seeded RNG carried in state

`xorshift128` — 4 × `uint32`, ~10 lines, no dependency, and its whole state is in a
`Uint32Array` inside `State` so a frame is fully described by `(payload, seed, tick)`.

```ts
export function rngNext(s: Uint32Array): number {   // s.length === 4
  let t = s[3]; const w = s[0];
  s[3] = s[2]; s[2] = s[1]; s[1] = w;
  t ^= t << 11; t ^= t >>> 8;
  s[0] = t ^ w ^ (w >>> 19);
  return s[0] / 0x100000000;
}
export function seedRng(seed: number): Uint32Array {
  const s = new Uint32Array([seed | 0, 0x9e3779b9, 0x243f6a88, 0xb7e15162]);
  for (let i = 0; i < 16; i++) rngNext(s);      // warm up
  return s;
}
```

Every one of the prototype's 6 `Math.random()` call sites **(M)** becomes `rngNext(state.rng)`.
The default seed is a **constant checked into source**, not `Date.now()`. `?seed=` in the
query string overrides it for bug reports and for Playwright.

The RNG is only permitted inside `sim/`. `render/` must never call it — anything visually
random (jitter, dither) must be a deterministic hash of `(entityId, tick)`, not a stream,
because render may be called a different number of times than sim.

---

## 3. Contribution grid

### 3.1 The 5-year grid does not fit on one screen — measured (M)

1,826 days = 261 week-columns. At the prototype's 11 px cell + 2 px gap that is
`261 × 13 = 3,393 px` wide **(M)** — wider than any laptop. This is why the design ships
**two** canvases (lines 76 and 83 **(M)**):

| Tier | Cells | Cell size | Width | Purpose |
|---|---|---|---|---|
| Overview strip (`overRef`) | 261 × 7 = 1,827 | ~4 px + 1 gap | ~1,305 px | whole 5 years, scrubbable |
| Detail ribbon (`ribbonRef`) | 53 × 7 = 371 | 11 px + 2 gap | ~689 px | the 371-day window that follows the cursor |

Keep both. Any proposal to render 1,826 legible cells in one row is arithmetically dead.

### 3.2 The 10-stop ramp

The prompt specifies interpolating `--bg1 #3c3836` → `--green-d #98971a` → `--green #b8bb26`
and beyond. **Doing that naively produces a brown ramp** — measured:

`#3c3836` is OKLCH(0.3441, 0.0066, **48.5°**) and `#98971a` is OKLCH(0.6564, 0.1354,
**109.1°**) **(M)**. A straight hue interpolation walks 48° → 109°, i.e. through orange, and
levels 1–5 come out `#5d3f28 #704c20 #805c16 #8c6e0b #948209` — rust, not green **(M)**.

Fix: `--bg1` is the *zero* stop and is the only neutral. Level 1 jumps straight into the green
family (H ≈ 124°) at low lightness; hue then rides 124° → 102° and lightness/chroma carry the
ramp. This is also what the prototype does (its ramp runs H 133° → 88° **(M)**).

**Ship this:**

```ts
// gruvbox dark medium, log2 contribution bands, OKLCH-derived, hue held in the green family
export const LV = [
  '#3c3836', // 0  zero            = --bg1
  '#404a2b', // 1  1
  '#4d5b21', // 2  2–3
  '#5e6a1f', // 3  4–7
  '#70791d', // 4  8–15
  '#83881b', // 5  16–31
  '#98971a', // 6  32–63           = --green-d   (exact gruvbox anchor)
  '#b8bb26', // 7  64–127          = --green     (exact gruvbox anchor)
  '#d9d34a', // 8  128–255
  '#faeb77', // 9  256+
] as const;
```

Verification, all **(M)** (CIEDE2000 + WCAG 2.x relative luminance, computed in Python):

| lv | hex | OKLCH H | contrast vs pane `#1d2021` | ΔE00 vs previous |
|---|---|---|---|---|
| 0 | `#3c3836` | 48.5 | 1.41 | — |
| 1 | `#404a2b` | 123.3 | 1.74 | **16.61** |
| 2 | `#4d5b21` | 121.3 | 2.21 | 8.45 |
| 3 | `#5e6a1f` | 118.0 | 2.78 | 6.25 |
| 4 | `#70791d` | 115.1 | 3.47 | 6.43 |
| 5 | `#83881b` | 112.3 | 4.30 | 6.49 |
| 6 | `#98971a` | 109.1 | 5.29 | 6.06 |
| 7 | `#b8bb26` | 110.8 | 7.94 | 10.58 |
| 8 | `#d9d34a` | 106.8 | 10.44 | 6.85 |
| 9 | `#faeb77` | 102.0 | 13.44 | 6.68 |

- **Adjacent distinguishability: min ΔE00 = 6.06, max 16.61, mean 8.27.** The threshold for
  "distinguishable at a glance in small non-adjacent patches" is ΔE00 ≈ 3; every step clears
  it by 2× or better.
- **Non-adjacent minimum ΔE00 = 12.55** — no two stops two-or-more apart can be confused.
- Contrast vs the pane background is **strictly monotone 1.41 → 13.44**, so the ramp survives
  greyscale and the most common colour-vision deficiencies (it is a lightness ramp first, a
  hue ramp second).
- Level 0 vs pane: WCAG 1.41, ΔE00 9.23 **(M)** — the empty grid is legible as a grid without
  reading as activity.
- Level 9 `#faeb77` vs `--fg0 #fbf1c7` (body text): ΔE00 13.12 **(M)** — the hottest cell does
  not get confused with text.
- Levels 6 and 7 are the **exact** gruvbox tokens, so the legend can say "`--green-d` =
  32–63" truthfully.

**Agent (its-applekid) companion ramp**, same lightness, hue rotated to `--purple` (2.2°):

```ts
export const AG = ['#3c3836','#5a3b43','#764251','#8b4c5f','#a1586d',
                   '#b6637c','#cc708b','#f98cac','#ffa6c6','#ffc5e1'] as const;
```

Minimum LV↔AG separation at equal level is **ΔE00 31.9** **(M)** — unmistakably a different
actor. Adjacent-within-AG min ΔE00 5.29 **(M)**. Note AG levels 7–9 sit **outside sRGB before
clipping**; they are clamped. If that matters, cap the agent ramp at level 6 and use a
pattern (the prototype's partial-height fill, line 605 **(M)**) for higher levels.

Contribution grid cells are **combined** human + agent per the product brief; `AG` is for the
partial-fill share indicator and the graph's agent-owned repos, not for a second grid.

### 3.3 Canvas vs SVG vs CSS grid — the answer is "Canvas, but the grid is a cached bitmap"

Measured at 1,826 cells, flush-forced, Chromium 150 software raster **(M)**:

| Strategy | ms/frame | Notes |
|---|---|---|
| Canvas, `fillStyle` set per cell | 0.338 | naive |
| Canvas, batched into 10 `fillStyle` runs | 0.255 | 1.3× better, not the big win |
| **Canvas, blit cached bitmap + 1 highlight `strokeRect`** | **0.0225** | **11–15× better** |
| Canvas, blit cached bitmap only | 0.0220 | highlight costs 0.0005 ms |
| DOM/CSS-grid, build 1,826 `<i>` + first layout | 12.9 (once) | +3,652 DOM nodes |
| DOM/CSS-grid, restyle all cells + forced layout | 0.775 | |
| DOM/CSS-grid, move highlight (2 style writes + layout) | 0.014 | |
| SVG, build 1,826 `<rect>` + first layout | 6.0 (once) | |
| SVG, restyle all rects + forced layout | 0.270 | |

The decisive argument is not raw speed — all three are under budget for a *static* grid.
It is **what happens 60 times a second**. The grid's *colours* change only when the data
changes (i.e. never, after load). Only the **highlight** moves per frame (§4).

- **Canvas + cached bitmap**: per-frame cost `0.0225 ms` = **0.13 % of a 16.7 ms budget**.
  The bitmap is `3,393 × 91 = 308,763 px` **(M)** = 1.24 MB at dpr 1, 4.94 MB at dpr 2 — one
  texture, well under the 16,384 px dimension cap.
- **DOM/CSS grid**: the per-frame highlight is cheap (0.014 ms) but it costs **3,652 extra DOM
  nodes** permanently, and headless timing does not capture real style-recalc + paint +
  composite. A 1,826-node grid also breaks the tooltip model — the prototype's hover does one
  arithmetic hit-test (line 690 **(M)**) instead of 1,826 event targets.
- **SVG**: same node-count problem, and no path to the pixel effects the ribbon needs
  (the `shadowBlur` glow at `lv >= 8`, line 601 **(M)**).

**Decision: Canvas 2D, both tiers. Grid pixels live in an offscreen bitmap rebuilt only on
data change or resize; the per-frame draw is `drawImage` + one `strokeRect`.** The DOM keeps
exactly one node for the tooltip. This is 0.13 % of frame budget vs the ~2–5 % a full redraw
would cost, and it scales to a 10-year view for free.

Caveat, honestly stated: an earlier unflushed run of the same test reported 62 ms for the
naive path **(M, `/tmp/vizbench/b2.html`)** and did **not** reproduce under forced flush
(0.338 ms). Trust the flushed numbers. The *ordering* is identical in both runs.

---

## 4. Coupling the graph cursor to the grid highlight

The coupling is **one integer, read-only, one direction**. There is no event, no callback, no
observer.

```ts
// sim owns exactly one number
state.cursor: number            // float day index, decreasing

// render/ribbon.ts derives everything, per frame, from that number
const day    = Math.floor(state.cursor);
const winStart = clamp(day - 185, 0, N - 371);   // detail window follows, hysteresis below
const w = ((day - winStart) / 7) | 0;
const d =  (day - winStart) % 7;
```

Per frame the ribbon draws, on top of the cached bitmap:

1. a **column wash** `rgba(251,241,199,.05)` over the whole week column, and
2. a 1 px `strokeRect` on the exact day cell at `rgba(251,241,199,.42)`.

This is the prototype's approach (lines 612–618 **(M)**) and it is right: *a soft column plus a
hairline, never a jumping box.* Measured cost: **0.0005 ms** (0.0225 with highlight vs 0.0220
without) **(M)**.

Three specifics that are easy to get wrong:

- **Window hysteresis.** Re-centring the 371-day window every day makes the ribbon crawl
  continuously and destroys readability. The prototype only moves the window when it drifts
  > 3 days: `if (Math.abs(w - this.winStart) > 3)` (line 892 **(M)**). Keep it, and tween
  `winStart` rather than snapping.
- **User override latches.** Dragging the overview sets `userWin = true` (line 515 **(M)**)
  and the window stops following. Needs a visible "follow playhead" affordance to un-latch —
  the prototype has none.
- **The overview strip needs its own playhead**, a 1 px vertical rule at
  `x = (cursor / N) * width`, plus the `◆ 29 jan 2026 · agent initialized` marker
  (line 78 **(M)**). Both are `f(cursor)`; neither needs state.

Because the highlight is a pure function of `cursor`, and `cursor` is a pure function of
`tick` (§2.3), **the highlight position is reproducible from an integer**. That is what makes
the §8 screenshot test meaningful — the assertion is "at tick 3600 the highlight is on
2024-11-02", which is checkable without pixel diffing.

---

## 5. Actor sprites

### 5.1 What `kevin.png` actually is (M)

Decoded with a hand-rolled zlib/PNG reader (no PIL on this box):

```
public/images/kevin.png:  270 x 310, 8-bit RGBA, non-interlaced, 2,325 bytes
GCD of all colour run-lengths = 10   ->  it is a 27 x 31 image stored at 10x
17 unique RGBA values, of which 11 are opaque
palette: #ffffff #090909 #271d14 #100a05 #070201 #a87468 #cca68e #ebc0a8 #facabc #ffded2 #794d43
```

The 27 × 31 logical grid is a head-and-shoulders bust with a 1 px `#ffffff` keyline, a dark
brown hair mass, and a photo-derived skin palette. **None of those 11 colours is a gruvbox
token.** `public/images/kevin-mask.png` is the same geometry, 2,405 bytes.

Two problems with the asset as it stands:

1. **It is unusable at token size.** The graph draws actor tokens at r ≈ 11 px (line 833
   **(M)**). Downscaling a 270 px bitmap to 22 px with smoothing turns pixel art to mush;
   without smoothing it aliases. The 10× pre-scale is pure waste — 2,325 bytes storing 837
   logical pixels.
2. **The prototype does not use it at all.** `drawActor` draws an aqua circle with the text
   `kw` for the human and a rotated purple square with `ak` for the agent (lines 828–847
   **(M)**). So today there is *no* sprite pipeline, and the "matching agent sprite" gap is
   actually a "no sprite pipeline" gap.

### 5.2 Proposal: sprites are text, rasterized at boot

Ship both actors as a **27 × 31 ASCII grid + a palette map**, not as PNGs.

```
src/viz/sprites/everdred.pxa      # 31 lines x 27 chars, one char per pixel
src/viz/sprites/applekid.pxa
src/viz/sprites/palette.ts        # char -> gruvbox token
```

`render/sprites.ts` walks the grid once at boot and `fillRect(x, y, 1, 1)` into a 27 × 31
`OffscreenCanvas` (`typeof OffscreenCanvas !== 'undefined'` → available **(M)**), then keeps
one pre-scaled copy per integer zoom (1×, 2×, 3×) with `imageSmoothingEnabled = false`.
Per-frame cost is a single `drawImage`, which measured **0.0202 ms** for a 300 px tile **(M)** —
a 27 px sprite is strictly cheaper.

Why this and not PNG:

- **868 bytes of grid + 96 bytes of palette = 964 bytes raw** per sprite **(M)**, and it
  gzips to near nothing because it is mostly repeated characters. vs 2,325 bytes for the PNG.
- It is **diff-reviewable in git**. A recolour is a one-line palette change, not a binary blob.
- It **forces palette discipline**: the palette file can only reference gruvbox tokens, so a
  non-gruvbox colour cannot enter by accident (which is how `#ebc0a8` got in).
- Both actors share one code path, so they cannot drift.
- Retheming (e.g. a light mode) is a palette swap, free.

The extraction is already proven — the ASCII grid for `kevin.png` was produced from the PNG
in this session, so the migration is mechanical, and the original PNG stays in the repo as
provenance.

### 5.3 What `its-applekid` should look like

Same 27 × 31 canvas, same silhouette *proportions* as the human bust (so the two read as a
matched pair at 22 px), same 1 px keyline — but the keyline is `--fg0 #fbf1c7` instead of pure
white, which is the single change that makes the human sprite gruvbox-native too.

| Region | Human (`its-everdred`) | Agent (`its-applekid`) |
|---|---|---|
| Keyline | `--fg0` `#fbf1c7` | `--fg0` `#fbf1c7` |
| Head mass | hair, `--bg1`/`--bg2`/`--bg3` greys | **CRT chassis**, `--purple-d` `#b16286` body, `--purple` `#d3869b` highlight |
| Face | `--fg2 #d5c4a1` / `--fg3 #bdae93` / `--fg4 #a89984` (3-tone, no photo skin) | **screen**, `--bg-h #1d2021`, with two `--green #b8bb26` 2×2 "eyes" and one `--green-d` block cursor |
| Shoulders | `--aqua-d #689d6a` (matches the human's ring stroke, line 834 **(M)**) | `--purple-d #b16286` (matches the agent's, line 840 **(M)**) |
| Badge | none | a 2×2 `--red #fb4934` apple with a 1 px `--green #b8bb26` leaf on the left shoulder |
| Idle animation | none | block cursor blinks — one palette index swapped on `(tick / 45) % 2`, no extra sprite |

The apple badge is the only literal pun and it is 5 pixels; at 22 px it reads as a red dot,
which is enough. The CRT-with-a-cursor head is the load-bearing idea: it says "terminal",
"agent", and "not a person" simultaneously, in a design system that is already a tmux
session.

**How to produce it:** hand-author the 27 × 31 `.pxa` in a text editor against the extracted
human grid as a proportion reference (shoulders start at row 18, head occupies rows 4–17,
body width 21 px — all readable off the extracted ASCII). This is ~40 minutes of work and
needs no image tool, no AI generation, and no binary asset. A `scripts/sprite-preview.mjs`
that prints the grid to the terminal with ANSI truecolour closes the loop.

Fallback if hand-authoring stalls: derive `applekid.pxa` programmatically from
`everdred.pxa` by replacing the face region with a filled rect and remapping the palette —
the silhouette is then guaranteed to match, at the cost of a less characterful head.

---

## 6. The private-repo cluster — `ctx.filter` is a trap

### 6.1 Measured (M)

Chromium 150, software raster, 1280 × 720, flush-forced (`/tmp/vizbench/b5.html`):

| Approach | ms/frame | vs 16.7 ms budget |
|---|---|---|
| `ctx.filter='blur(8px)'` + 60 arc fills | **312.12** | **1,870 %** |
| `ctx.filter='blur(8px)'` + 20 large arc fills (r=120) | **108.72** | **651 %** |
| `ctx.filter='blur(8px)'` + **1** full-canvas `fillRect` | 5.65 | 34 % |
| **Pre-blurred 300 px tile: 1 `drawImage`** | **0.0202** | **0.12 %** |
| Pre-blurred tile + `save/globalAlpha/rotate/restore` | 0.4314 | 2.6 % |
| Rebuild the pre-blur (60 arcs + 1 filtered `drawImage`) | 0.1962 | amortized, per resize |
| Procedural: 500 × 2 px dither dots | 0.1404 | 0.8 % |
| Procedural: 24 hatch lines clipped to a circle | 0.7020 | 4.2 % |
| Downscale→upscale pseudo-blur | 19.84 | rejected |

**The mechanism.** Cost is **per draw call while a filter is active**, not per pixel:
108.72 / 20 = 5.44 ms per call; 312.12 / 60 = 5.20 ms per call; and a single full-canvas
`fillRect` under blur is 5.65 ms. All three agree on **≈ 5.4 ms per filtered draw call at
1280 × 720** — Chromium runs a full canvas-sized filter pass for *every* primitive drawn while
`ctx.filter` is set. Radius barely matters (r=6 arcs and r=120 arcs cost the same per call).

**Verdict: never set `ctx.filter` around path drawing. Set it around exactly one
`drawImage` of a small offscreen, and only when rebuilding.**

### 6.2 What ships

```
build (on resize, on data change, ~5 times per session):
  clusterSrc: OffscreenCanvas(300, 300)
    60 filled circles, --bg2 #504945 / --bg3 #665c54, positions from rngNext(state.rng)
    radii proportional to the measured private volume per year (2024: 2,360 private) 
  clusterTile: OffscreenCanvas(300, 300)
    ctx.filter = 'blur(9px)'; drawImage(clusterSrc, 0, 0); ctx.filter = 'none'
  cost: 0.196 ms, once                                                          (M)

per frame:
  ctx.drawImage(clusterTile, x, y)                       // 0.0202 ms            (M)
  ctx.setLineDash([6,5]); ctx.strokeStyle = '#665c54'; ctx.arc(...); ctx.stroke()
  ctx.fillText('private repos', ...)
```

Three rules that fall out of the measurements:

1. **No `save()/restore()/rotate()/globalAlpha` on the blit path.** Adding them takes
   0.0202 ms → 0.4314 ms, a **21×** regression **(M)** — the transform/state machinery
   dominates, not the pixels. Bake alpha into the tile at build time.
2. **The blurred tile is static.** Do not re-blur to animate. Give the cluster life with the
   *unblurred* dashed ring and the label, which are cheap, plus a slow drift of the whole
   tile's `x, y` (integer positions only, to avoid resampling).
3. **The procedural fallback is real and cheap.** The prototype already draws hatched
   diagonals clipped to a circle (lines 771–776 **(M)**) at 0.702 ms **(M)**. That is 4.2 % of
   budget — fine as a `filter`-unsupported fallback, and arguably *more* on-brand than a
   Gaussian blur in a terminal aesthetic. Feature-detect once
   (`ctx.filter = 'blur(2px)'; ctx.filter === 'blur(2px)'` → supported **(M)**) and pick.

Recommendation: **pre-blurred tile as the primary, hatch as the fallback, and consider
shipping hatch-only** — 0.702 ms is affordable, it needs no offscreen, no feature detection,
and "redacted" reads better as a terminal `████` texture than as a soft blur. The blur is
the safer *aesthetic* bet; the hatch is the safer *engineering* bet.

Security note: this is honest redaction. Per the measured findings, `restrictedContributions
Count` gives private **volume with no repo names or paths**, so there is nothing to leak —
the cluster is generated from a count, not from obscured real data. Say so in the tooltip.

---

## 7. Performance budget — the numbers a reviewer should assert

All from `/tmp/vizbench/b5.html` and `b6.html`, software raster, flush-forced **(M)**.
These are the pessimistic bound; assert against them.

### 7.1 Unit costs (M)

| Primitive | Measured | Derived unit cost |
|---|---|---|
| Small arc fill (r=4) | 5,000 → 6.044 ms | **1.21 µs each** |
| Small arc fill (r=4) | 2,000 → 2.454 ms | 1.23 µs each — linear |
| Large arc fill (r=120) | 20 → 0.261 ms | 13.1 µs each |
| Short radial line (40 px) | 2,000 → 0.610 ms | **0.30 µs each** |
| Long random line (~640 px) | 2,000 → 5.101 ms | 2.55 µs each — cost tracks **length**, not count |
| `fillText` 11 px mono | 200 → 0.314 ms | **1.57 µs each** |
| Arc with `shadowBlur=12` | 300 → 2.365 ms | 7.88 µs each vs 1.50 µs unshadowed → **5.3× penalty** |
| `drawImage` cached bitmap | 1 → 0.0202–0.0225 ms | ~0.02 ms |

### 7.2 Full-scene budget (M)

`SCENE` = 20 repo circles (fill + stroke) + 800 file circles + 40 beams + 20 labels + 1
blurred cluster + full-canvas clear, at 1280 × 720:

```
DPR 1    3.952 ms       (23.7 % of 16.7 ms)
DPR 1.5  4.920 ms       (29.5 %)   1.25x
DPR 2    7.036 ms       (42.2 %)   1.78x
DPR 3   10.596 ms       (63.5 %)   2.68x
```

Scaling is **sub-quadratic in dpr** (dpr 2 costs 1.78× not 4×) because path setup is CPU
geometry, independent of raster resolution. **Clamping at dpr 2 saves 34 % vs dpr 3** **(M)** —
that is the measured justification for the prototype's `Math.min(2, devicePixelRatio)`
(line 521 **(M)**).

### 7.3 The budget

| Target | Value | Basis |
|---|---|---|
| **Target FPS** | **60** on desktop, 60 on modern mobile, graceful to 30 | |
| **Frame budget** | **8 ms** for all three canvases combined (50 % of 16.7 ms) | leaves headroom for GC, layout, the log panel |
| **Measured headroom** | 3.95 ms at dpr 1, 7.04 ms at dpr 2 | (M) — at dpr 2 the scene *is* the budget on CPU raster; on GPU it will be far under |
| **Max file circles on screen** | **2,000** | 2.45 ms (M). Peak live in the model is 869 (M). Cull the rest by heat, oldest-first |
| **Max repo circles** | **24** (20 real + private + slack) | 0.26 ms at 20 (M) |
| **Max radial spokes** | **2,000** | 0.61 ms (M). Only draw spokes for files with `heat > 0.15`; the prototype draws one per *visible* file (line 793 (M)) — cap it |
| **Max beams** | **256** (fixed ring buffer) | 0.65 ms as long lines (M) |
| **Max `fillText` per frame** | **200** | 0.31 ms (M). Repo labels always; file labels only at `heat > 0.55` (prototype, line 802 (M)) |
| **Max `shadowBlur` primitives** | **48** | 0.38 ms (M). The prototype applies it per-file at `heat > 0.3` and per-cell at `lv >= 8` — both must be capped |
| **Draw calls per frame** | **≤ 3,000** total across all three canvases | grid tiers contribute 2 (§3.3) |
| **`ctx.filter` calls per frame** | **0** | 5.44 ms each (M) |
| **devicePixelRatio** | `Math.min(2, window.devicePixelRatio \|\| 1)`; re-read on `matchMedia('(resolution: Ndppx)')` change | 34 % saving vs 3 (M) |
| **Per-frame allocations** | **0** in `sim/`; render may allocate only strings for `fillText` | typed arrays + ring buffers |
| **Sim step cost** | **< 20 µs** | 0.42 µs/day × 32 days/s = 13 µs/s (M) |
| **Boot layout cost** | **< 15 ms** one-time | 7.99 ms measured for 9,480 files (M) |
| **Viz JS bundle** | **≤ 20 KB gzip** | §10 |

**Adaptive degradation.** Measure a rolling median frame time over 60 frames in `driver.ts`.
If it exceeds 12 ms for 30 consecutive frames, step down: (1) drop file labels, (2) drop
spokes, (3) drop `shadowBlur`, (4) drop dpr to 1, (5) halve the file cap to 1,000. Each step
is a boolean in a `quality` object read by `render/`, never by `sim/` — so quality changes do
not affect determinism or the screenshot tests.

---

## 8. Determinism for testing

### 8.1 The API

`driver.ts` exports a test harness behind a build flag *and* a query param, so it is available
in a production build for bug reports but inert unless asked for.

```ts
// window.__viz — present only when ?viz-test=1 or NODE_ENV !== 'production'
interface VizTestHarness {
  /** Stop the rAF loop. Idempotent. Returns once the in-flight frame has settled. */
  pause(): Promise<void>;

  /** Reset to tick 0 with an explicit seed. Re-runs packOnce. */
  reset(seed?: number): void;

  /**
   * Advance the sim by exactly `n` fixed steps, then render exactly once.
   * Never touches performance.now(). Returns after the render has been
   * rasterized (awaits ctx.getImageData(0,0,1,1) on every canvas), so a
   * screenshot taken after the await is guaranteed to show this frame.
   */
  renderFrame(n?: number): Promise<VizFrameInfo>;

  /** Jump straight to a tick. Equivalent to reset() + renderFrame(t) but O(n) not O(t). */
  seekTick(t: number): Promise<VizFrameInfo>;

  /** Jump to a calendar date. Uses the O(n)=9.7us rescan (M), no checkpoints. */
  seekDate(iso: string): Promise<VizFrameInfo>;

  /** Everything a test needs to assert without pixel-diffing. */
  inspect(): VizFrameInfo;

  /** Force a quality tier so degradation never makes a screenshot flaky. */
  setQuality(q: 'high' | 'low'): void;

  /** Resume normal rAF playback. */
  play(): void;
}

interface VizFrameInfo {
  tick: number;
  cursorDay: number;           // float
  date: string;                // 'YYYY-MM-DD' of Math.floor(cursorDay)
  nLive: number;
  liveRepos: string[];         // sorted, stable
  highlightCell: { week: number; weekday: number } | null;
  winStart: number;
  beams: number;
  rngState: [number, number, number, number];   // assert the RNG did not drift
  drawCalls: number;           // per-canvas counters, for the §7 budget assertions
  lastFrameMs: number;
}
```

`renderFrame` is the primitive the brief asks for; `seekTick` is the one tests will actually
use, because it is `O(n)` (9.7 µs **(M)**) rather than `O(t)` — a test that wants tick 100,000
should not run 100,000 steps.

### 8.2 Why this is sound

Determinism rests on four properties, each of which is independently testable:

1. **`sim/` is pure.** Enforced by ESLint + a Node-only unit test (§2.1).
2. **Frame ≡ `(payload, seed, tick)`.** `cursor = cursor0 - speed × FIXED × tick`, exactly.
3. **RNG state is in `State`.** `inspect().rngState` lets a test assert the RNG advanced by
   exactly the expected number of draws — catching accidental `rngNext` calls in render.
4. **Rasterization is synchronised.** Without the `getImageData` await, Playwright's
   screenshot races Chromium's deferred command buffer — this session measured that deferral
   directly (a full benchmark suite reporting `0.0000 ms` for every entry until a flush was
   added, `/tmp/vizbench/b4.html` **(M)**).

### 8.3 The tests

```ts
// playwright
test('frame 3600 is stable', async ({ page }) => {
  await page.goto('/?viz-test=1&seed=1');
  await page.evaluate(() => window.__viz.pause());
  await page.evaluate(() => window.__viz.setQuality('high'));
  const a = await page.evaluate(() => window.__viz.seekTick(3600));
  expect(a.date).toBe('2025-11-14');            // assert semantics, not pixels
  expect(a.liveRepos).toEqual([...]);           // assert the §1 state model
  expect(a.drawCalls).toBeLessThan(3000);       // assert the §7 budget
  await expect(page.locator('#graph')).toHaveScreenshot('t3600.png', { maxDiffPixels: 0 });

  const b = await page.evaluate(() => window.__viz.seekTick(3600));  // idempotency
  expect(b).toEqual(a);
});
```

Assert `VizFrameInfo` **before** the screenshot. A semantic assertion tells you *what* broke;
a pixel diff only tells you *that* something did. Screenshots are the backstop, not the test.

Font caveat: `JetBrains Mono` must be a self-hosted woff2 with `font-display: block` and the
test must `await document.fonts.ready`, or text renders in a fallback and every screenshot
diffs. Non-negotiable for a JetBrains-Mono-only design system.

---

## 9. Accessibility — what actually ships

The design file has **zero** `aria-*`, `role`, `tabindex`, or `alt` attributes
**(M — `grep -n -iE 'aria|role=|tabindex|alt='` returns nothing in the canvas region)**.
This section is entirely new work.

### 9.1 `prefers-reduced-motion`

The prototype reads it **once at construction** (line 205 **(M)**) and never listens for
changes. Ship instead:

```ts
const mq = matchMedia('(prefers-reduced-motion: reduce)');
mq.addEventListener('change', e => setReducedMotion(e.matches));   // live, not once
```

Under reduce:

- **No rAF loop at all.** Not "slower" — `cancelAnimationFrame`, and the driver never starts.
- Render **one** static frame at `tick = 0` (i.e. today), via the same `renderFrame(0)` path
  the tests use. One code path, so the fallback cannot rot.
- Beams, heat glow, the blinking cursor on the agent sprite, and the `shadowBlur` pulse are
  all disabled — they are the motion, not the content.
- The prototype's `settleStatic()` (line 463 **(M)**) shows the *fully accumulated* final
  state. Under the §1 lifespan semantics that is wrong; the static frame must be
  `visible(e, today)`, i.e. the seed set, which is also the most informative frame.
- Playback controls remain **enabled**. Reduced motion is a default, not a prohibition — a
  user who presses Play gets animation. This is the correct reading of the media query and
  it is what the arrow-key stepping (below) is for.

### 9.2 Static fallback frame

Beyond reduced-motion, ship a `<noscript>`-and-error-boundary fallback: a **pre-rendered PNG**
of the graph at today's date plus a real `<table>` of the contribution grid, generated at
build time by the same `render/` modules running under `node-canvas` or a headless Chromium
step. Because `render(state)` is a pure function of `State` and `State` is buildable in Node
(§2.1), this is ~30 lines of build script, not a parallel implementation.

### 9.3 Keyboard

Deleting the Bomberman game deletes the only `keydown` handler that exists (lines 477–491
**(M)**), including a global `Space` capture with `preventDefault()` that hijacks page scroll
for the entire document — that is an accessibility bug being removed, not a feature.

Replacement, **scoped to the canvas**, which gets `tabindex="0"` and a visible focus ring:

| Key | Action |
|---|---|
| `Space` | play / pause (only when the canvas has focus) |
| `←` / `→` | step **one day** back / forward while paused; nudge cursor while playing |
| `Shift + ←/→` | step one week |
| `Home` / `End` | jump to 2021-08-01 / today |
| `+` / `-` | cycle `speeds = [4, 8, 12, 20, 32]` |
| `Esc` | release focus, un-latch the window from user scrub |

`→` (forward) is essential: a keyboard user must be able to undo an accidental rewind. The
lifespan model (§1.1) makes forward stepping free — it is the same two-pointer run in reverse,
with the pointers decrementing.

The overview strip becomes a real `<input type="range">` visually hidden behind the canvas,
so scrubbing works with a screen reader and with the keyboard for free, with
`aria-valuetext="2 November 2024"` updated from `cursorDay`.

### 9.4 Text alternative

Three layers, in order of who reads them:

1. **`role="img"` + `aria-label`** on the graph canvas, updated at most **once per simulated
   week** (not per frame — an aria-live update per frame is a screen-reader DoS):
   `"Repository activity graph, 2 November 2024. 7 repositories active: aiur, gary, ..."`
2. **`aria-live="polite"` region** carrying the same text, but only when the user is actively
   scrubbing, and throttled to 1 update / 2 s.
3. **A real `<table>`, visually hidden, always in the DOM**: the contribution grid as
   `<caption>Contributions by day, Aug 2021 – Jul 2026</caption>` with one row per week and
   `<th scope="row">` week-of dates, cells reading `"2 November 2024: 12 contributions
   (level 4)"`. 1,826 `<td>` elements is 1,826 nodes — acceptable *because they are never
   styled or animated*, which is exactly the cost §3.3 rejected for the visual grid.
   This table is also the `<noscript>` fallback and the SEO surface. One artefact, three jobs.

The commit-log panel (`pushLog`, line 908 **(M)**) is already a text stream of the animation;
mark it `role="log" aria-live="off"` and let it be the "read the animation" affordance for
sighted users who cannot parse the graph.

---

## 10. GSAP licence in 2026 — and why the answer is "don't use it"

### 10.1 What was verified (M)

```
npm view gsap version license
  version = '3.15.0'
  license = "Standard 'no charge' license: https://gsap.com/standard-license."
```

```
npm pack gsap@3.15.0 && tar tzf gsap-3.15.0.tgz | grep -i licen
  package/README.md          <- the ONLY match. There is no LICENSE file in the tarball.
```

`package/README.md` line 90–93, verbatim **(M)**:

> ### License
> GreenSock's standard "no charge" license can be viewed at <https://gsap.com/standard-license>.
>
> Copyright (c) 2008-2026, GreenSock. All rights reserved.

Fetched from <https://gsap.com/standard-license> **(M)**, effective **2025-04-30**, last
modified **2025-05-30**. Quoted clauses:

- Grant: *"use, reproduce, display, and implement GSAP Products solely for Permitted Uses"*,
  where Permitted Uses include *"implementation and/or use of GSAP Products on any website,
  web application, or digital interface by any person or entity"*.
- Commercial use: the FAQ states *"Yes, really! Commercial usage is covered under the standard
  license."*
- Prohibited Uses: *"any implementation and/or use of GSAP Products in tools that allow users
  to build visual animations without code that encourages, induces, or materially assists in
  creating a solution that competes with Webflow's visual animation building capabilities"*.
- Also prohibited: *"Reverse engineer any GSAP Products for the purpose of creating
  Competitive Products"* and *"Remove or alter any proprietary notices or branding"*.
- AI: *"AI-generated code is not a 'Prohibited Use'."*

**A personal portfolio site is squarely inside Permitted Uses and nowhere near the Webflow
carve-out.** The prior doc's note that the "no competing SaaS" restriction is
blog-propagated inference is **partly wrong**: a competing-product restriction *is* in the
licence text, but it is narrowly scoped to no-code visual animation builders, which this is
not. Corrected, not contradicted.

### 10.2 The actual risk is not the terms, it is that they are not pinned

- **No `LICENSE` file ships in the tarball** **(M)**. The only artefact is a URL.
- **The `license` field is not an SPDX identifier** — it is an English sentence **(M)**.
  `license-checker`, `npm audit --omit`, the GitHub dependency graph, and most SBOM tooling
  will report this as `UNKNOWN` / unrecognised.
- **The URL is mutable.** The current text is dated 2025-04-30 / modified 2025-05-30 **(M)**;
  GreenSock (now Webflow) can change it unilaterally and `gsap@3.15.0` on disk would silently
  fall under new terms with no version bump.

If GSAP is used, mitigation is mandatory: vendor the licence text into
`third_party/gsap/LICENSE-3.15.0.txt` with the retrieval date, and pin the exact version (no
caret).

### 10.3 But the architecture does not need it

- **The prototype uses no tween library** — all motion is exponential smoothing and linear
  decay **(M)**.
- **GSAP core is 28.3 KB gzip** (`gzip -9 -c package/dist/gsap.min.js | wc -c` → 28,268
  **(M)**). That is **larger than the entire rest of the viz runtime**: `packSiblings +
  packEnclose` source is 2,310 bytes gzip **(M)**.
- **`d3-force` is not needed either.** The prototype places 20 repos on a deterministic
  ellipse by sorted index (lines 728–744 **(M)**). Force adds `d3-force` 4.0 KB + `d3-quadtree`
  3.3 KB + `d3-dispatch` 1.0 KB + `d3-timer` 1.3 KB = 9.6 KB gzip of source **(M)**, plus the
  iterative-settling determinism hazard, plus the "register the containment clamp last"
  footgun from the prior doc — to solve a 20-node layout that a `cos/sin` already solves
  exactly. **Drop `d3-force`.** This is a correction to the previously "chosen architecture".
- GSAP *can* be driven deterministically — `gsap.updateRoot(time)` and
  `gsap.ticker.lagSmoothing()` both exist in `dist/gsap.js` **(M)** — but doing so means
  removing GSAP's ticker and hand-driving it, which is most of the value gone.

### 10.4 Decision

**Do not ship GSAP.** Ship a ~40-line easing helper over plain objects in `sim/tween.ts`,
driven by the fixed-timestep integrator that already exists (§2.3). The tween set this design
needs is small and enumerable: appear/disappear alpha, repo ring easing, beam life, heat
decay, window scroll. All are `lerp` + one of four easings.

**Named fallbacks**, if a hand-rolled tween proves insufficient:

| Library | Version | Licence | Size (gzip) | Fit |
|---|---|---|---|---|
| **`@tweenjs/tween.js`** | **25.0.0** | **MIT** | **7.0 KB** | **best.** Its primary API is `TWEEN.update(time)` — explicit time driving is the *default*, which is exactly what §2.3 and §8 need |
| `motion` | 12.43.0 | MIT | — | DOM-oriented; wrong layer for canvas |
| `popmotion` | 11.0.5 | MIT | — | maintenance-mode |
| `animejs` | 4.5.0 | MIT | 40.8 KB | MIT but **1.4× larger than GSAP** — no |

All versions and licences **(M)** via `npm view <pkg> version license`; sizes **(M)** via
`npm pack` + `gzip -9`.

### 10.5 Other library claims, re-verified (M)

`npm view <pkg> version license`, run this session:

| Package | Version | Licence | Verdict |
|---|---|---|---|
| `@cosmograph/cosmos` | **3.4.1** | **CC-BY-NC-4.0** | confirmed non-commercial. 3.4.0 published **2026-07-30**, 3.4.1 **2026-07-31** — the relicence is one day old. Excluded |
| `cytoscape` | 3.34.0 | MIT | licence fine; compound parents still rectangles-only. Excluded on capability, not licence |
| `webcola` | 3.4.0 | MIT | **published 2019-05-10** (the `time.modified` of 2022-06-28 is a metadata touch, not a release). Dead. Excluded |
| `d3-hierarchy` | 3.1.2 | ISC | **included** — `packSiblings`/`packEnclose` only |
| `d3-force` | 3.0.0 | ISC | **excluded** — see §10.3 |
| `d3-scale` / `d3-array` / `d3-interpolate` | 4.0.2 / 3.2.4 / 3.0.1 | ISC | excluded; the ramp is a 10-entry constant array (§3.2) |
| `pixi.js` | 8.19.0 | MIT | excluded on size |

### 10.6 Resulting bundle budget

| Item | gzip |
|---|---|
| `d3-hierarchy` `packSiblings` + `packEnclose` | 2.3 KB **(M)** |
| tween helper (hand-rolled) | ~0.3 KB |
| `sim/` (state, step, cursor, rng, layout) | ~6 KB (I) |
| `render/` (graph, ribbon, overview, sprites) | ~8 KB (I) |
| sprite grids (2 × 964 B of highly compressible text) | <0.5 KB **(M)** |
| **Total** | **≈ 17 KB** |

vs the prior doc's 35 KB estimate, vs 45 KB with GSAP, vs 131 KB cytoscape, vs 245 KB PIXI.

---

## Open questions

1. **Does the lifespan model read as intended, or does it feel like things are vanishing
   arbitrarily?** This needs a 60-second prototype spike against real data before committing.
   The mitigation (dwell tail + fade, §1.6) is a guess at the right feel.
2. **Do the ghost-out repos leave a trace?** A dimmed outline where a repo used to be would
   preserve the "you've seen more" property while keeping the honest lifespan set. Costs one
   extra stroke per dead repo (≤ 24 × 13 µs = 0.3 ms). Probably yes — untested.
3. Is `packSiblings` over the *union* of ~2,500 files per repo visually acceptable at repo
   circle sizes of 60–120 px? A 2,500-circle pack at r=120 gives sub-pixel files. May need a
   directory-level rollup (the prior doc measured depth-2 rollup at **2.1 KB gzip**) as the
   default zoom level, with files only on hover/zoom.
4. GPU-vs-CPU: every canvas number here is SwiftShader. A GPU-accelerated run on real hardware
   should be taken before the §7 caps are treated as hard limits — they may be 3–5× loose.
5. Should the contribution grid's zero-cell be `--bg1 #3c3836` (this doc, per the brief) or
   `--bg0_s #32302f` (the prototype)? `#3c3836` is more visible as a grid; `#32302f` recedes
   more. Aesthetic call, not a technical one.

---

## Verification corrections

Adversarial verification pass, 2026-07-31. Independent re-measurement on the same machine:
system Chromium (`/usr/bin/chromium`, `--headless --disable-gpu`, WebGL renderer reported as
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` — same
software-raster class as the original run), Node v24.18.0. Benchmark sources written fresh, not
reused: `/tmp/advverify/v1.html`, `v2.html`, `v3.html`, `sim.mjs`, `sim2.mjs`, `col.mjs`,
`png.mjs`. **(V)** = independently re-measured by the verifier.

### What reproduced exactly

- **The entire §3.2 ramp table.** Every OKLCH hue, every WCAG contrast, every ΔE00, to 2 dp:
  min adjacent 6.06, max 16.61, mean 8.27, non-adjacent min 12.55 (at lv 4/6), lv0-vs-pane
  ΔE00 9.23 / contrast 1.41, lv9-vs-`--fg0` 13.12, min LV↔AG same-level 31.94, AG adjacent min
  5.29 **(V)**. Recomputed from scratch (sRGB→OKLab→OKLCH, CIE Lab + CIEDE2000, WCAG 2.x
  relative luminance) in `/tmp/advverify/col.mjs`. §3.2 is the most solid section in the doc.
- **The entire §5.1 PNG decode.** 270×310, 8-bit RGBA, non-interlaced, 2,325 bytes, 17 unique
  RGBA, 11 opaque, all 11 palette hexes identical, GCD of run lengths = 10 on *both* axes, and
  **0 non-uniform pixels inside the 10×10 blocks** — so "it is a 27×31 image stored at 10×" is
  proven, not inferred **(V)**. None of the 11 hexes is a gruvbox token (checked against the
  token list). `kevin-mask.png` = 2,405 bytes.
- **All of §10.1 / §10.5.** `gsap@3.15.0`; `license` field is the English sentence, not SPDX;
  no `LICENSE` in the tarball (only `package/README.md`); README §License verbatim as quoted;
  `gzip -9 -c package/dist/gsap.min.js | wc -c` = **28,268** **(V)**. <https://gsap.com/standard-license>
  re-fetched: effective **April 30, 2025**, last modified **May 30, 2025**, and all six quoted
  clauses verbatim **(V)**. `dist/gsap.js` contains `updateRoot` ×3 and `lagSmoothing` ×1 **(V)**.
  `@tweenjs/tween.js` 25.0.0 MIT, `dist/tween.esm.js` gzip **7,008 B** **(V)**;
  `animejs` 4.5.0 MIT, `anime.esm.min.js` gzip **40,836 B** (1.44× GSAP) **(V)**;
  `@cosmograph/cosmos` 3.4.1 **CC-BY-NC-4.0**, `cytoscape` 3.34.0 MIT, `webcola` 3.4.0 MIT,
  d3 modules ISC — all **(V)** via `npm view`.
- **§0 nondeterminism counts.** `Math.random` = 6, `performance.now` = 5, `Date.now`/`new Date`
  = 4 **(V)**. Canvases at 76 / 83 / 97 **(V)**. Zero `gsap|d3|forceSimulation|packSiblings`
  hits **(V)**.
- **§1.1's reading of the prototype.** `drawGraph` gates files on `if (!f.seen) return;`
  (line 796) and the source comment at line 714 says *"the graph accumulates: once a repo is
  reached it stays on the ring"* **(V)**. Semantics B is what the prototype implements; the
  doc is right about that.
- **§9's a11y claim, and it is stronger than stated.** `grep -c -iE 'aria-|role=|tabindex|alt='`
  over the *whole file* returns **0** **(V)** — not just "in the canvas region".
- **§6.1's mechanism.** Independently confirmed by a canvas-size sweep the original run did not
  do: at 1280×720, 60 filtered arc fills = 345.26 ms (**5.75 ms/call**), 20 filtered r=120 arcs
  = 119.50 ms (**5.98 ms/call**), 1 filtered full-canvas `fillRect` = **6.14 ms**. On a
  300×300 canvas the *same* draws cost 0.52 and 0.48 ms/call. Cost ratio 11.1 vs canvas-area
  ratio 10.24 **(V)** — the per-call cost really is a full canvas-sized filter pass. §6.1's
  ≈5.4 ms is reproduced (I get 5.75–6.14).
- **§3.3's decisive number.** Cached-bitmap blit = **0.0220 / 0.0225 ms** across three
  independent runs; +1 `strokeRect` = 0.0227 (highlight costs 0.0007 ms). Bitmap is exactly
  **3,393 × 91 px** **(V)**. `OffscreenCanvas` = `function`, `ctx.filter` feature-detect
  returns `blur(2px)` **(V)**.
- **§1.3's conclusions.** Re-implemented the two-pointer + max-heap pass from the §1.2
  pseudocode: full 1,826-day reverse pass 1.75 ms (0.96 µs/day) at n=7,354, 2.27 ms
  (1.24 µs/day) at true scale; `O(n)` seek 0.021 / 0.046 ms; bitset checkpoint 920 B / 18.0 KB
  exact **(V)**. "Reverse playback is free" and "do not build checkpoints" both hold, at both
  scales.
- **`packSiblings` is deterministic.** It uses d3-hierarchy's seeded `lcg()`, not `Math.random`;
  two runs over identical input are bit-identical **(V)**. n=20/300/1000/2500 →
  0.041 / 0.237 / 0.710 / 2.534 ms **(V)** (doc: 0.045 / 0.165 / 0.813 / 2.981 — same order).

---

### C1 (REFUTED, §1.3 / §1.4 / §7.3) — the corpus scale is ~1.8× too few files and 2.55× too few repos

`7,334 unique files` is **not** the corpus. It is **`aiur-team/aiur` alone**, and it comes from
the exact run that `docs/research/2026-07-31-data-pipeline.md:318` retracts:

> `2026-07-31-measured-findings.md:63` — "`git clone --filter=blob:none` (950 ms, 28 MB) +
> `git log --all --name-only` (14.5 s) → 3,611 commits, 25,679 file-touch events, **7,334
> unique files**"
>
> `2026-07-31-data-pipeline.md:318` — "**Correction to the prior doc (M):** it recorded aiur's
> blobless clone as '950 ms, 28 MB' and `git log --all --name-only` as '14.5 s'. Fresh
> measurement: 0.93 s, 4.4 MB, 0.08 s."

The corpus-wide figures, measured once and then independently re-verified in the same doc
(`data-pipeline.md:16–20` and `:763`), are:

| Quantity | viz-runtime doc | Measured truth | Ratio |
|---|---|---|---|
| Unique file paths | 7,334 (and 9,480 in §1.4, uncited) | **13,453** (`:763`, "exact") | **1.83×** |
| Repos with ≥1 event | "~20" | **51** (`:17`, `:763`, "exact") | **2.55×** |
| File-touch events | — | 44,886 / 44,923 | — |

"~20 repos" is the **design mock's** scale, not the data's: `kevinweaver.dev.dc.html:277` declares
**19** hand-written repo objects, each synthesising `Math.min(22, ...)` ≤ 22 files (line ~305)
**(V)**. Roughly 450 mock circles vs 13,453 real paths.

Downstream corrections:

- §7.3 **"Max repo circles 24 (20 real + private + slack)" is undersized 2.1×.** Budget 56
  (51 + private + slack). At the measured 13.1 µs per r=120 arc that is 0.73 ms, still fine —
  but the *layout* consequence is not: the prototype's deterministic ellipse (`rpx = max(0.30*(W-80), need/2π)`,
  line ~733) sizes the ring from the sum of label widths, and 51 labels on one ellipse will not
  fit a 1280 px canvas. §2's "ellipse by sorted index is better than force and should be kept"
  needs re-testing at 51, not 20.
- §7.2's SCENE (20 repos + 800 files) is under-scoped against both the real repo count and
  §7.3's own 2,000-file-circle cap. Treat 3.95/7.04 ms as a floor, not the budget.
- §1.4's *"the corpus never exceeds ~2,500 files in one repo"* is a **category error**. 2,487 is
  aiur's **HEAD tree entry count** (`measured-findings.md:82`, table headed "Repo trees"), which
  is a different quantity from *unique paths ever touched*. A repo with 3,593 commits and 25,679
  file-touch events necessarily has more historical paths than its current tree. The largest
  repo's historical path count is **not measured anywhere** and is the single input `packOnce`
  is most sensitive to — see C2.

### C2 (REFUTED, §7.3) — the "< 15 ms boot layout" budget has no measured headroom

`packSiblings` is ~`O(n^1.6)` **(V)**: n=1,000 → 0.710 ms, n=2,500 → 2.534 ms, n=7,789 →
**15.861 ms**. A `packOnce` over 13,453 paths spread across 51 repos with a heavy tail costs
6.40 ms **(V)** — fine. But aiur is **57.9 % of all file-touch events** (`data-pipeline.md:763`),
and if its unique-path share is anywhere near that, a single `packSiblings` call is 15.9 ms and
**alone exceeds the §7.3 budget**, before the other 50 repos.

This does not change the pack-once decision, but the budget line needs to be either re-derived
after measuring per-repo unique-path counts, or the directory-rollup from Open Question 3
promoted from "may need" to a precondition.

### C3 (REFUTED, §1.4) — `packSiblings` **is** stable under append

> §1.4: "it would make circles jump because `packSiblings` is not stable under insertion"

Measured on n=300 **(V)**:

| Mutation | Existing circles moved > 0.5 px | Mean drift | Max drift |
|---|---|---|---|
| **Append 1 circle to the end** | **0 / 300** | **0.000 px** | **0.00 px** |
| Remove 1 circle from the middle (index 150) | 150 / 150 checked | 5.08 px | — |

`packSiblings` is a greedy front-chain algorithm over the input array in order; appending is
purely additive and perturbs nothing. It is unstable under *middle* insertion/removal only.

Two consequences. (a) The stated justification for pack-once is wrong as written. (b) More
pointedly: under the prototype's **append-only accumulation model (semantics B)** the live set
only ever grows, so incremental packing would be *both* stable *and* cheap — the instability
argument is an argument that only exists *because* §1.1 chose semantics C. That is circular and
should not be offered as independent support for §1.4.

### C4 (REFUTED as (M), §1.4) — "8.05 set-changes/day" is a tautology and "286 ms/s" is an inference

I reproduce **8.05 set-changes per simulated day exactly** — with a completely different,
arbitrarily chosen lifespan distribution **(V)**. It is not a property of any data. In a
lifespan model every entity enters once and leaves once, so set-changes = `2n − (alive at T₀)`;
`2 × 7354 / 1826 = 8.054`. Change n and it changes mechanically: at the true 13,504 entities it
is **14.78/day** **(V)**. Marking it **(M)** implies it was observed; it is arithmetic on the
chosen n.

`2.98 ms × 96 = 286 ms/s` is likewise arithmetic on two measurements, marked **(M)**. It also
stacks two worst cases: that *every* set-change lands in the largest repo, and that a repack is
issued per set-change rather than coalesced. A dirty-repo flag repacked at most once per
*simulated day* costs `12 days/s × 2.53 ms = 30 ms/s` **(V-derived)** — ~3 % of a core, which is
affordable and does **not** "force a completely different renderer". The load-bearing argument
for pack-once is positional stability and determinism, not CPU — and C3 shows that argument is
narrower than claimed. **The pack-once decision survives; the cost argument for it does not.**

### C5 (REFUTED, §6.2 rule 1) — the blit-path cost is resampling, not "transform/state machinery"

> §6.2 rule 1: "No `save()/restore()/rotate()/globalAlpha` on the blit path … the
> transform/state machinery dominates, not the pixels."

Decomposed **(V)**, 300 px tile onto a 1280×720 canvas, 400–800 iterations each:

| Variant | ms | Δ vs baseline |
|---|---|---|
| `drawImage` at integer position | **0.0218** | — |
| + `save()` / `restore()` only | 0.0270 | **+0.005** |
| + `translate` only (`setTransform`) | 0.0230 | **+0.001** |
| + `globalAlpha = .8` only | 0.0436 | +0.022 |
| **+ rotate 0.1 rad only (`setTransform`)** | **0.4268** | **+0.405** |
| rotate + alpha, no `save`/`restore` | 0.4385 | +0.417 |
| full `save/alpha/translate/rotate/restore` (doc's repro) | 0.4497 | +0.428 |
| `drawImage` at **non-integer** position (400.5, 200.5) | 0.1819 | +0.160 |

It is **the pixels**, exactly opposite to the stated mechanism: 0.405 of the 0.428 ms regression
is rotation alone, and a mere half-pixel offset costs 0.160 ms. `save`/`restore` costs 0.005 ms
and banning it buys nothing; "bake alpha into the tile" buys 0.022 ms.

**Corrected rule 1: blit axis-aligned at integer coordinates. `save`/`restore`/`translate` are
free; rotation and sub-pixel placement are not.** (§6.2 rule 2's "integer positions only, to
avoid resampling" is the correct guidance and should be promoted to rule 1; it is currently
justified by a mechanism that the measurements contradict.)

### C6 (REFUTED as stated, §6.1) — the rule is "one draw call under filter", not "no path draws under filter"

> §6.1 verdict: "never set `ctx.filter` around path drawing"

Measured **(V)**, 1280×720:

| | ms |
|---|---|
| `filter=blur(8px)` + 60 arcs, 60 separate `fill()` calls | **345.26** |
| `filter=blur(8px)` + **the same 60 arcs in ONE path, ONE `fill()`** | **8.36** |
| `filter=blur(8px)` + 1 full-canvas `fillRect` | 6.14 |
| no filter, 60 separate arc fills (control) | 0.24 |

**41× cheaper.** Paths under `ctx.filter` are fine; *multiple draw calls* under `ctx.filter` are
not. This is the same rule that makes the §6.2 build step legal, so the shipping decision is
unchanged (8.36 ms is still 50 % of a frame — not viable per-frame). But as written the rule
would forbid a legitimate implementation. Rebuild cost re-measured at **0.2425 ms**
(doc: 0.1962); hatch fallback **0.7433 ms** (doc: 0.7020) **(V)**.

### C7 (REFUTED, §3.3) — "3,652 DOM nodes" is 1,827

Built the CSS-grid variant and counted **(V)**: 1,826 `<i>` + 1 container = **1,827 element
nodes**, and a `TreeWalker(host, SHOW_ALL)` also returns **1,827** — empty elements carry no
text nodes. The doc's own §9.4 says "1,826 `<td>` elements is 1,826 nodes", contradicting §3.3.

Re-measured DOM/SVG **(V)** (doc's values in parentheses): DOM build + first layout **10.7 ms**
(12.9); DOM restyle all + forced layout **1.382 ms** (0.775); DOM move highlight **0.0205 ms**
(0.014); SVG build **8.6 ms** (6.0); SVG restyle all **0.435 ms** (0.270). Same order, my run
consistently 1.5–1.8× higher.

Note what this does to §3.3's argument: **DOM highlight-move (0.0205 ms) is statistically
indistinguishable from the entire canvas blit + highlight (0.0227 ms)**. The per-frame cost
argument for canvas over DOM is *not* decisive. The decisive arguments are the ones §3.3 lists
second — the O(1) arithmetic hit-test vs 1,826 event targets, and `shadowBlur` at `lv >= 8`
having no DOM/SVG equivalent. Lead with those.

### C8 (REFUTED, §10.3 / claim 5) — d3-force 3.0.0 is deterministic

> claim: "if `d3-force` is reinstated, repo layout stops being deterministic and the screenshot
> tests need pixel tolerance"

`grep -rn 'Math.random' d3-force-3.0.0/package/src/` returns **nothing** **(V)**.
`src/simulation.js:26` is `random = lcg();`, `:121` exposes `randomSource()`, and
`src/jiggle.js` takes the random source as a *parameter*. Two independent 300-tick runs of a
20-node `forceSimulation` with `manyBody + link + center + collide` are **bit-identical**
(node 0 = 174.54220914, 69.80304481 both times) **(V)**.

The decision to drop `d3-force` still stands, but on the two surviving grounds only: **bundle
size** (re-measured src gzip: d3-force 3,797 B + quadtree 3,175 + dispatch 984 + timer 1,290 =
**9.25 KB**, doc said 9.6 KB **(V)**) and cross-engine/CPU float reproducibility (untested by
either of us). Delete "stops being deterministic" from the argument — it is false, and a
reviewer who knows d3-force will notice.

`packSiblings` + `packEnclose` + their closure (`lcg.js`, `array.js`) gzip to **2,455 B**; the
two pack files alone are **2,141 B** **(V)** — doc says 2,310 B, between the two.

### C9 (REFUTED, §1.3 / §2.2) — the memory figure understates the doc's own `State` by 2×

`172.4 KB` = `7,354 × 24 B` exactly = **six** 4-byte arrays. §2.2 declares **twelve** entity-length
arrays (`birth, death, repoOf, px, py, pr, heat, alpha, live, slot, byDeath, birthHeap`) = 48 B
per entity = **344.7 KB** at n=7,354, and **633.0 KB** at the true n=13,504 **(V)**.

The conclusion ("nothing is streamed out of necessity") survives — 633 KB is still nothing — but
the number in the table is wrong by 3.7× against real scale.

---

### Unproven (not refuted — could not be confirmed)

- **§1.3 "Peak live set 869 entities" (M).** This is a property of an *undisclosed synthetic
  lifespan generator*, not of Kevin's data. Running the same algorithm with a different
  (equally arbitrary) lifespan distribution I get **612** at n=7,354 and **1,077** at n=13,504
  **(V)**. §7.3's 2,000-file-circle cap therefore rests on a free parameter. Either publish the
  generator or derive the peak from the real `git log --name-only` output.
- **§3.2 "levels 1–5 come out `#5d3f28 #704c20 #805c16 #8c6e0b #948209`" (M).** Not
  reproducible. A straight-hue OKLCH lerp `--bg1 → --green-d` over 7 stops gives
  `#524338 #675036 #795e32 #886f2a #938220` **(V)** — different hexes, **same conclusion**
  (brown/olive, not green). The argument holds; the specific hex list needs the interpolation
  parameters stated or should be dropped.
- **§3.3 "Canvas, `fillStyle` per cell = 0.338 ms".** Order-sensitive. Run first in a fresh
  context, three consecutive reps: **0.478 / 0.442 / 0.438 ms**; run after the filter benches in
  the same context: **1.442 ms** **(V)**. Batched: 0.333 / 0.327 / 0.317 fresh (doc 0.255). The
  blit number is rock-solid across every run (0.0220–0.0225); the *naive* number is not, so the
  "11–15×" ratio should be stated as "≥ 15×, measured 20× in a fresh context".
- **§3.2 "AG levels 7–9 sit outside sRGB before clipping".** Cannot verify without the
  generator; the published hexes are already clipped.
- **§7.2's SCENE table** (3.952 / 4.920 / 7.036 / 10.596 ms) — not independently re-run. See C1
  for why it is under-scoped regardless.
- **§6.2's "2024: 2,360 private"** — cross-checked and correct (`data-pipeline.md:243`), but it
  is a *year-2024* figure being used to size a cluster; confirm that is intended.

### Citation hygiene (minor, but pervasive)

Line references drift by 2–6 throughout. Verified line numbers **(V)**:

| Doc says | Actually |
|---|---|
| `r.entered = true` line 723 | **717** (and 465 in `settleStatic`) |
| `d <= r.to + 90` line 714 | **716** (714 is the comment) |
| `userWin = true` line 515 | **513** |
| `r.px += (r.gx - r.px) * 0.045` line 749 | **747**, and the coefficient is `(this.snap ? 1 : 0.045)`, not the literal `0.045` |
| file labels at `heat > 0.55` line 802 | **806** |
| `drawActor` lines 828–847 | **827–846** |
| `f.heat *= 0.955` line 797 | 797 ✔ |
| `this.speeds` 209, `this.day = this.N - 1` 451, `settleStatic` 463, `f.seen = true` 464, dpr clamp 521, `lv >= 8` glow 601, cursor decrement 887, window hysteresis 892, `graphDateRef` 94 | all ✔ |

§0's attribution table is also incomplete: **2 of the 6 `Math.random` sites are in `emitLive`**
(lines 952, 953), not in the three functions listed; and **1 of the 5 `performance.now` sites is
in `begin()`** (line 458), not in `drawGame`/ribbon/keydown **(V)**. The counts are right, the
"Where" column is not — and since the stated migration plan is "every one of these becomes
`rngNext(state.rng)`", an incomplete site list is the kind of thing that leaks a determinism bug.

### Net effect on the five load-bearing claims

| # | Claim | Verdict |
|---|---|---|
| 1 | Lifespan-interval visibility, not monotonic accumulation | **Design decision, not a fact.** The factual half — "the prototype implements monotonic accumulation" — is confirmed at `:714` and `:796`. Note that C3 removes one of the arguments used to prop up the choice |
| 2 | Pack once over the union; per-set-change layout costs 286 ms/s | **Decision survives, both supports weakened.** 286 ms/s is a stacked worst case (C4); "unstable under insertion" is false for append (C3). And the boot budget itself busts at real scale (C1, C2) |
| 3 | `ctx.filter` never near a path draw; 5.44 ms/call | **Magnitude confirmed and mechanism independently proven** (area sweep). Rule mis-stated: it is one-draw-call-under-filter, not no-paths-under-filter (C6). Rule 1's mechanism is backwards (C5) |
| 4 | Grid is a cached bitmap; DOM would be 3,652 nodes | **Decision survives; node count is 1,827 (C7)**, and the per-frame cost argument is not decisive — DOM highlight ties the canvas blit. Lead with hit-testing and `shadowBlur` |
| 5 | Drop GSAP and d3-force | **GSAP half fully confirmed** (28,268 B, non-SPDX, mutable URL, license text verbatim). **d3-force half refuted**: it is deterministic (C8). Drop it on size, not on RNG |
