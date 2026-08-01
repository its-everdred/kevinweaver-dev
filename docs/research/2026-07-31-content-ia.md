# kevinweaver.dev — content + information architecture

Date: 2026-07-31. Track: CONTENT + IA. Everything marked **(M)** was measured this session
(authenticated `gh`, `curl`, `date`, local file reads). **(I)** marks inference.

This document contains **finished, ready-to-paste copy**. Sections 4–10 are the deliverables;
sections 1–3 are the IA decisions that place them; sections 11–13 are what must be resolved
with Kevin before publishing.

---

## 0. The single most important finding

**(M) The design comp encodes a different career than the authoritative resume, and it must be
thrown away as content.**

`docs/design/kevinweaver.dev.dc.html` lines 137–157 assert:

- man page DESCRIPTION: *"the front end of ethereum.org and the ethereum foundation site"*
- git-log row `0xc0de1 · 2023–24 · ethereum foundation web properties`
- git-log row `5eed128 · 2025–26 · aiur · etherguild · agent tooling`
- `this.repos` (lines 277–297) containing `ethereum/ethereum-org-website`,
  `ethereum/ethereum-foundation-website`, `its-applekid/agent-actions`,
  `its-applekid/vector-eth`, `0xmetropolis/metal` as a 2022–23 span.

Measured reality:

| Comp claim | Measured | Command |
|---|---|---|
| ethereum.org front end, 2023–24 role | **1 commit + 1 PR, 2023** | `contributionsCollection(2023)` |
| EF website, 2023–24 role | **1 PR, 2026** | `contributionsCollection(2026)` |
| Nothing for 2023–2025 employment | Metropolis Sep 2022 – Apr 2025 (resume) | resume |
| Nothing for 2025–present employment | Optimism May 2025 – present (resume) | resume |
| `its-applekid/agent-actions`, `vector-eth` | **do not exist** | repo listing, 58 public repos |

The comp's copy is placeholder fiction that reads as a *plausible* resume, which makes it
dangerous — it will survive review by looking finished. Every string in §0–§7 of the comp's
content layer is replaced below.

---

## 1. Surface inventory (what the comp actually gives us)

Read from the comp + `_ds/.../layers/*.css` (M):

| Anchor / element | Comp line | Role |
|---|---|---|
| sticky header + nav `1 whoami / 2 arc / 3 contact` | 52–64 | section nav, waybar-style active state |
| `contributions` pane (overview strip + 53×7 ribbon) | 69–87 | data, not prose |
| `gource — repo graph` pane | 90–116 | data |
| `events — tail -f` pane | 118–123 | generated log lines |
| `#whoami` → `man kevin-weaver` pane (1fr col) | 127–145 | **man page** |
| `#arc` → `git log --graph --oneline` pane (2fr col) | 146–159 | **git log** |
| `#contact` pane (icon row) | 162–170 | **contact** |
| `.tmux` powerline bar | 173–181 | **status segments** |
| `bootRef` cold-start overlay | 183–190 | **boot sequence** |

### 1.1 Design-system affordances the comp leaves on the table (M)

- **`.commit .ref` exists in `data.css` and the comp never uses it.** It is styled
  `flex:0 0 auto; color:var(--text-faint)` — a purpose-built slot for
  `(HEAD -> optimism, tag: role/optimism)`. Use it.
- **`.tmux` has `.wins`, `.win`, `.win.active`, `.host`, `.chev` classes the comp never
  uses.** The comp hand-rolls three generic `.seg`s. The window-list vocabulary is free.
- **`.pane-body{overflow:hidden}`** (`pane.css`) — a scrollable man-page pager needs an
  explicit `overflow:auto` override on that one pane. Load-bearing for §1.2.
- **No Nerd Font / PUA glyphs are used anywhere in the comp** — verified by codepoint
  histogram over the whole file; zero characters in U+E000–U+F8FF. `tmux.css`'s header
  comment says this is deliberate: powerline arrows are CSS `clip-path` triangles because
  Google-hosted JetBrains Mono ships no PUA range. **All copy below is restricted to ASCII
  plus the 16 non-ASCII codepoints the comp already proves:**
  `· — • – ◆ ● → ⏸ ☰ ⠿ ◉ ⏮ ⏭ ✉ ★ ▶`.

### 1.2 One structural change to the comp

The comp's `#whoami` left column is a single `man kevin-weaver` pane holding only NAME /
DESCRIPTION / SEE ALSO. A full man page will not fit. Split that column into **two stacked
panes**:

```
#whoami  (grid 1fr 2fr)
├── col 1
│   ├── pane: "whoami"            ~11 lines, fixed height, no scroll
│   └── pane: "man kevinweaver"   pager, overflow:auto, flex:1
└── col 2
    └── pane: "git log ..." (#arc)  the primary resume surface
```

The `man` pane gets a `less(1)` chrome: pane-bar reads
`man kevinweaver(1)` on the left and `(END)` / `12%` on the right, `j`/`k`/`space` scroll,
`q` collapses it. Below 1080px the two columns already stack (`.kw-2up` media query, comp
line 38) — collapse the man pager to `SYNOPSIS + DESCRIPTION` with a `[ more ]` toggle.

---

## 2. Fact allocation — nothing duplicated, nothing lost

Every fact from the authoritative resume has exactly one home.

| Fact | Home | Not in |
|---|---|---|
| Name "Kevin Weaver" | `whoami` Name field, man `NAME`, git author line | — (name may repeat; it is the only exception) |
| Title "Lead Fullstack Software Engineer" | `whoami` `Title:` | man NAME uses a descriptive gloss instead |
| Tagline (web3 builder / Ethereum / public goods) | `whoami` `Project:` block (verbatim) | man DESCRIPTION paraphrases in roff register |
| Location "CA, USA" | `whoami` `Location:`, man `AUTHOR` | contact pane |
| Current employer + role + start date | `whoami` `On since` line + git log HEAD | man DESCRIPTION ¶3 references it once, by product not employer |
| **All six employers, dates, achievements, tech stacks** | **git log only** | man page, whoami |
| Education (Rowan, B.S. MIS, minor CS, 2008–2012) | **man `FILES`** as `/usr/share/doc/...` + one root commit in git log | whoami |
| Skills: Serial Podcaster, Technical Educator, Hackathon Connoisseur | **man `OPTIONS`** as `--podcast`, `--teach`, `--hackathon` | git log, whoami |
| Hackathon record (~12 events, DeFi/NFT/governance/analytics/social) | man `OPTIONS --hackathon` body + one git tag | — |
| Full tech vocabulary | man `SEE ALSO` (the comp already puts a token list there) | git log bodies carry only per-role stacks |
| Contact channels (clickable) | **contact pane only** | man page points at it |
| Reporting/offers etiquette | man `REPORTING BUGS` | contact pane |
| Two actors (`its-everdred` / `its-applekid`) | `whoami` `Also logged in as:` + man `ENVIRONMENT KW_ACTOR` + graph legend | — |
| Contribution statistics | boot sequence + tmux bar + contributions pane | prose |
| Phone number | **nowhere** — see §11 | everywhere |

Rule of thumb that produced this: **the man page is who he is, the git log is what he did,
`whoami` is what he is doing right now, `contact` is how you reach him.** Tense, not topic.

---

## 3. Reading order under backwards playback

Playback starts at *now* and walks back (user requirement). The prose must mirror that.

- `whoami` (present tense, one screen down from the live graph)
- `arc` = git log, newest-first — already reverse-chronological, so it *is* the same gesture
- man page — timeless, sits beside the log
- `contact` — terminal

**(M) Consequence to escalate:** `search(query:"author:its-everdred org:ethereum-optimism",
type:ISSUE)` returns `issueCount: 0`, and 2026 shows `restrictedContributionsCount: 488`.
**The current role is 100% private.** Because playback starts at *now*, the first thing a
visitor sees in the gource pane is the redacted "Private repos" blob. The most impressive,
most current work is literally the least visible frame. Fix in one of two ways:

1. give `actions.optimism.io` a first-class **named** node (public product, public docs,
   private repo) with no file children — a labeled circle with a dashed interior; or
2. delay the redacted blob's entrance by ~2 s so `aiur` (1,268 commits in 2026, M) and
   `its-everdred/gary` render first and the frame is not mostly grey.

Recommend (1); (2) alone is dishonest about volume.

---

## 4. DELIVERABLE — `man kevinweaver`

Ships in three places: rendered into the `#whoami` pager; served verbatim as plain text at
`/resume.txt`; served as real roff at `/kevinweaver.1` so
`curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` works. The third is a 20-line
`pages/api/` route and is the highest joy-per-byte thing on the site.

```
KEVINWEAVER(1)                General Commands Manual               KEVINWEAVER(1)

NAME
       kevinweaver - lead fullstack software engineer; turns ambiguous problems
       into shipped, documented, onchain-adjacent systems

SYNOPSIS
       kevinweaver [-v...] [--remote] [--stack=LIST] [--chain=NETWORK]
                   [-j JOBS] [--ship] [--] PROBLEM...

       kevinweaver --hire [--full-time | --contract | --advise]

       kevinweaver --hackathon [--weekend] [--win]

DESCRIPTION
       kevinweaver reads one or more PROBLEM operands from an ambiguous source,
       decomposes them into contracts, services, and interfaces, and writes
       production systems to standard output. Tests and documentation are
       emitted on the same pass; they are not a separate target.

       Passionate web3 builder, Ethereum enthusiast, and public goods enjoyer
       designing human coordination tools on the internet's frontier.

       In continuous operation since February 2010 across six employers, two
       of which were his own, and every major version of JavaScript's identity
       crisis. Currently deployed as technical architect of the Actions SDK
       (actions.optimism.io). Prior deployments are recorded in git-log(1);
       see the arc pane, or run:

              $ curl -sL kevinweaver.dev/resume.txt

       kevinweaver is fullstack in the literal sense: it terminates at the
       Postgres row on one end and the pixel on the other, and has been paged
       for both.

OPTIONS
       -j JOBS, --jobs=JOBS
              Run up to JOBS problems in parallel. JOBS defaults to the number
              of available afternoons. Values above 3 are accepted but degrade
              to round-robin context switching and a longer standup.

       --teach
              Technical educator. Emits the same idea at four levels of detail
              until one of them lands. Led a cross-organization educational
              effort at ConsenSys and wrote the docs people actually paste
              into Discord.

       --podcast
              Serial podcaster. Opens an audio stream, records ninety minutes,
              ships forty. Implies --teach.

       --hackathon
              Hackathon connoisseur. Award-winning across nearly a dozen
              events: rapid end-to-end Web3 and full-stack applications
              spanning DeFi, NFTs, governance, analytics dashboards, and
              social and creator tooling. Idempotent on caffeine. Not
              idempotent on sleep.

       --stack=LIST
              Comma-separated. Recognized values: typescript, solidity, ruby,
              rails, react, next, node, express, hono, vite, elixir, rust,
              graphql, postgresql, mongodb, redis, k8s. Unrecognized values
              are not an error; they are a weekend.

       --chain=NETWORK
              Target an EVM network. Defaults to $KW_CHAIN. Passing
              --chain=mainnet during a gas spike is permitted, not advised.

       --remote
              Default since 2020. Timezone is America/Los_Angeles. Overlap
              with UTC+1 is negotiable and has historically been survived.

       --ship
              Deploy. Ignores --perfect. There is no --perfect.

       -v, --verbose
              Increase explanation. May be repeated. -vvv produces a diagram,
              an ADR, and a follow-up thread nobody asked for.

       --force
              Merge without review. Retained for compatibility with early
              stage startups. Behavior is undefined and has been.

ENVIRONMENT
       KW_ACTOR
              Which identity is committing. One of its-everdred (human, since
              2011-09-01) or its-applekid (agent, initialized 2026-01-29).
              Both write to the same contribution graph and are counted
              separately in the tooltip. This page documents only the former.

       KW_CHAIN
              Preferred settlement layer. Default: optimism.

       KW_TZ  America/Los_Angeles. Set in December 2017 and never unset.

       KW_COFFEE
              Required. If unset, kevinweaver falls back to a degraded mode
              with identical syntax and worse opinions.

       NO_COLOR
              Honored everywhere except the pixel art.

FILES
       /usr/share/doc/kevinweaver/rowan-university.bs
              B.S. Management Information Systems, minor in Computer Science.
              Rowan University, September 2008 - May 2012. Overlaps the first
              two years of /var/log/kevinweaver/career.log; see the graph.

       /var/log/kevinweaver/career.log
              Append-only, never rotated. Read with git-log(1); rendered in
              the arc pane.

       ~/.config/kevinweaver/opinions.toml
              Strongly held, loosely coupled. Reloaded on new evidence
              without a restart.

       ~/dotfiles
              github.com/its-everdred/dotfiles. Do not edit ~/.zshrc by hand;
              it is a symlink and it will be overwritten.

       /dev/coffee
              Character device. Blocking.

EXAMPLES
       Connect an embedded wallet to a DeFi protocol without shipping that
       protocol's footguns to end users:

              $ kevinweaver --chain=optimism --stack=typescript,solidity \
                    "let embedded wallets use lending markets"
              -> actions.optimism.io

       Turn a smart contract into something a product team can deploy on a
       Tuesday:

              $ kevinweaver --stack=solidity,typescript --ship \
                    "arbitrary tx and contract deployment engine"

       Keep an open source developer tool with 13,900 stars usable while its
       ecosystem moves to L2:

              $ kevinweaver --teach "truffle, boxes, bridging, evm debugging"

       Ship a customer-facing feature to millions of users, twice, without a
       rollback:

              $ kevinweaver -j 1 --stack=ruby,rails,react,postgresql \
                    "revenue, but for humans"

       Read this page the way it was written:

              $ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -

DIAGNOSTICS
       Exit status is 0 on ship.

       1      Scope changed after the estimate. Not a bug.
       2      Blocked on review. Escalated politely, then loudly.
       17     Waiting on a testnet faucet.
       42     Answer found; the question was wrong. Rerun with -v.
       137    OOM-killed by quarterly planning.

SEE ALSO
       git-log(1), whoami(1), finger(1), curl(1), forge(1), solc(1), tsc(1),
       kubectl(1), ethereum(7), public-goods(7)

       typescript - solidity - react - next - node - express - hono - vite -
       ruby - rails - elixir - rust - graphql - postgresql - mongodb - redis -
       kubernetes - foundry - subgraphs - ci/cd

AUTHOR
       Written by Kevin Weaver. California, USA. <https://kevinweaver.dev>

REPORTING BUGS
       Report bugs, offers, and strong disagreements through the contact pane
       at kevinweaver.dev, or open an issue against github.com/its-everdred.
       Pull requests are read. Drive-by refactors are read twice.

BUGS
       Will explain the entire system when asked a yes-or-no question.

       Cannot leave a TODO in the tree overnight. Documented as a feature,
       behaves as a bug.

       Estimates are accurate in relative units and wrong in absolute ones.
       Multiply by pi and round up.

       Refuses to ship a UI with a loading spinner and no empty state. WONTFIX.

       Reads the changelog. All of it.

       Since 2026-01-29 a second process (its-applekid) writes to the same
       repositories. Per-commit attribution is exact; attribution in
       conversation is worse. Prefer git-blame(1).

KEVINWEAVER(1)                      2026-07-31                     KEVINWEAVER(1)
```

**Register notes for the implementer:** hyphen-minus, not en-dash, in `NAME` (roff
convention). Section headers are flush-left caps; body is indented 7, option bodies 14.
Wrap at 78 columns. In the HTML pager keep the monospace column and let it scroll
horizontally on mobile rather than reflowing — reflowed man pages read as broken.

### 4.1 Abridged variant for the `<1080px` collapsed pane

```
NAME
       kevinweaver - lead fullstack software engineer

SYNOPSIS
       kevinweaver [--remote] [--stack=LIST] [--chain=NETWORK] [--ship] PROBLEM...

DESCRIPTION
       Passionate web3 builder, Ethereum enthusiast, and public goods enjoyer
       designing human coordination tools on the internet's frontier.

       Sixteen years, six employers, two of them his own. Currently technical
       architect of the Actions SDK at Optimism.

                                                        [ press m for full page ]
```

---

## 5. DELIVERABLE — the git log (`#arc`, the primary resume surface)

### 5.1 Model

Each **role is a branch**; the branch is **merged into `main` when the role ends**. The
current role is an **open, unmerged branch that HEAD sits on**. Side projects live on a
long-running `side` branch. Education is a branch that overlaps the first consultancy —
which is true (Rowan Sep 2008 – May 2012, Omni founded Feb 2010) and produces the single
best moment in the graph: two live lanes in 2010–2012.

Author line: `Kevin Weaver <kevin@kevinweaver.dev>` — see §11.2 before committing to this.
All SHAs are valid lowercase hex `[0-9a-f]{7}`, no shared prefixes.
**(M) The comp's `0xc0de1` (line 153) is not valid hex — `x` is not a hex digit.** The exact
audience this site targets will notice. Every SHA below is hex-clean.

All weekdays below were computed with `date -d` (M) and are correct for the stated dates.

### 5.2 Full log — paste target for `/resume.txt` and the expanded pane

```
$ git log --graph --decorate --all

* commit 7c4a1e9 (HEAD -> optimism, origin/optimism)
| Author: Kevin Weaver <kevin@kevinweaver.dev>
| Date:   Fri Jul 31 16:04:11 2026 -0700
|
|     Gate DeFi actions behind explicit config
|
|     Allow and block listing for the Actions SDK, plus configuration for
|     assets, markets, chains, and infra providers. An integrator now
|     declares what their users can reach instead of forking the SDK and
|     deleting the parts they are scared of.
|
|     Stack: TypeScript, Hono, Vite, React, Solidity, Kubernetes.
|
* commit b0d3f21
| Author: Kevin Weaver <kevin@kevinweaver.dev>
| Date:   Fri Nov 14 11:38:02 2025 -0800
|
|     Define the Actions SDK surface
|
|     Technical architect. Took "embedded wallets should be able to use
|     DeFi" from a doc to an interface: one call per action, protocol
|     adapters behind it, policy at the edge. The hard part was not the
|     transactions. The hard part was deciding what an action is.
|
|     actions.optimism.io
|
* commit 4e88c02 (tag: role/optimism)
| Author: Kevin Weaver <kevin@kevinweaver.dev>
| Date:   Mon May  5 09:12:44 2025 -0700
|
|     Join Optimism as Senior Full Stack Engineer
|
|     OP Labs. May 2025 - present. Remote, America/Los_Angeles.
|     Note: this branch is not merged. It is still being written.
|
*   commit 9c2b7e0 (main, origin/main)
|\  Merge: 8ab30f1 6b3fe17
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Wed Apr 30 17:55:19 2025 -0700
| |
| |     Merge branch 'metropolis' into main
| |
| |     Two years and seven months. Lead Software Engineer at Metropolis
| |     (github.com/0xmetropolis), Sep 2022 - Apr 2025. Smart contract
| |     developer tooling for teams who ship products, not papers.
| |
| |     Stack: TypeScript, Express, Next.js, React, Solidity, Redis,
| |     MongoDB, GraphQL.
| |
| * commit 6b3fe17
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Nov  8 14:21:36 2024 -0800
| |
| |     Ship a multi-sig module
| |
| |     Treasury operations without a spreadsheet and a group chat.
| |     Proposal, threshold, execution, and an audit trail that a
| |     non-engineer can read on a phone.
| |
| * commit 1a4d90b
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Jun 13 10:07:55 2024 -0700
| |
| |     Add tokenization and wallet infrastructure
| |
| |     Issue, custody, and move assets from one product surface. Wallet
| |     provisioning stopped being a support ticket.
| |
| * commit f28c6a3
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Oct 26 09:44:02 2023 -0700
| |
| |     Build an arbitrary transaction engine
| |
| |     Compose, simulate, and submit any call to any contract, with
| |     deployment as a first-class case rather than a special one. This
| |     is the piece everything else at Metropolis was built on.
| |
| * commit 05e7bd4
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Mar  9 15:30:47 2023 -0800
| |
| |     Deploy contracts from a browser
| |
| |     0xmetropolis/metal, plus the subgraph and metro-sdk behind it.
| |     Indexing with GraphQL so the UI could ask a question instead of
| |     replaying the chain.
| |
| * commit c0ffee2 (tag: role/metropolis)
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Mon Sep 19 08:59:13 2022 -0700
| |
| |     Join Metropolis as Lead Engineer
| |
| |     Sep 2022 - Apr 2025.
| |
*   commit 8ab30f1
|\  Merge: 4c1b8f6 e7b1c56
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Sep 15 16:12:08 2022 -0700
| |
| |     Merge branch 'consensys' into main
| |
| |     One year. Lead Blockchain Engineer at ConsenSys, Sep 2021 -
| |     Sep 2022. Open source smart contract developer tools, in public,
| |     with the issue tracker open. Managed outside contributions and
| |     led a cross-organization educational effort.
| |
| |     Stack: TypeScript, Solidity.
| |
| * commit e7b1c56
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Jun 23 13:02:41 2022 -0700
| |
| |     Bridge Truffle to L2
| |
| |     optimism-bridge-box, arbitrum-box, polygon-box: a working L1<->L2
| |     bridge in a template you can unbox, not a blog post you can read.
| |     45 commits to the Optimism box alone - the largest single body of
| |     public work in that year.
| |
| * commit 2fa6c81
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Feb 11 11:19:26 2022 -0800
| |
| |     Make the EVM legible while it runs
| |
| |     Debugging tools for a virtual machine that reverts with a number.
| |     Truffle core, 13.9k stars, now archived - which is what a decade
| |     of open source looks like when it works.
| |
| * commit 7ea1eaf
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Oct  7 09:41:00 2021 -0700
| |
| |     Maintain the box templates and the docs site
| |
| |     truffle-box templates and trufflesuite.com. Every one of these is
| |     somebody's first hour in Ethereum. Optimizing for that hour is
| |     the whole job.
| |
| * commit bda4517 (tag: role/consensys)
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Mon Sep 13 08:30:00 2021 -0700
| |
| |     Join ConsenSys as Lead Blockchain Engineer
| |
| |     Sep 2021 - Sep 2022.
| |
*   commit 4c1b8f6
|\  Merge: e9a4b30 3d0aa9e
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Sep 10 17:44:30 2021 -0700
| |
| |     Merge branch 'stitch-fix' into main
| |
| |     Three years and nine months. Lead Software Engineer at Stitch Fix,
| |     Dec 2017 - Sep 2021. Tech lead on customer-facing features earning
| |     millions in revenue and serving millions of users. Designed
| |     microservice APIs consumed across the organization.
| |
| |     Stack: Ruby, Rails, React, TypeScript, PostgreSQL, GraphQL.
| |
| * commit 3d0aa9e
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Mar 19 14:06:12 2021 -0700
| |
| |     Take a revenue-bearing feature to GA
| |
| |     Tech lead end to end: scope, API contract, rollout, and the
| |     dashboard that proved it worked. Millions in revenue attributable
| |     to the surface, and no rollback.
| |
| * commit a11ce55
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Aug 27 10:52:44 2020 -0700
| |
| |     Design microservice APIs for org-wide reuse
| |
| |     GraphQL and REST contracts adopted by teams who never met me.
| |     The measure of an internal API is how rarely you are asked
| |     about it.
| |
| * commit 61f4b2d
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu May  2 09:15:37 2019 -0700
| |
| |     Serve millions of users on Rails
| |
| |     Ruby, Rails, PostgreSQL under real load. Learned what a p99 is
| |     from the inside.
| |
| * commit 9e07c3a (tag: role/stitch-fix)
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Mon Dec  4 08:45:00 2017 -0800
| |
| |     Join Stitch Fix as Lead Software Engineer
| |
| |     Dec 2017 - Sep 2021.
| |
*   commit e9a4b30
|\  Merge: 0d5e6a8 db7e015
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Dec  1 18:02:55 2017 -0500
| |
| |     Merge branch 'ems-heroes' into main
| |
| |     Three years and nine months. Co-founder and fullstack engineer at
| |     EMS Heroes: medical records and billing software for emergency
| |     medical services. Co-founded it, wrote it, supported it.
| |
| |     Stack: Ruby, Rails, JavaScript.
| |
| * commit db7e015
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu May 19 11:27:19 2016 -0400
| |
| |     Bill for care that already happened
| |
| |     Insurance billing for ambulance runs. The domain is unforgiving:
| |     a dropped field is a claim denial is a bill somebody cannot pay.
| |
| * commit 2076ac9
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Feb 26 09:03:41 2015 -0500
| |
| |     Replace the paper run sheet
| |
| |     Patient care reports written on a tablet in a moving vehicle by
| |     someone wearing gloves. Every UX decision after this one has
| |     been easier.
| |
| * commit 5eed128 (tag: role/ems-heroes)
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Mon Mar  3 08:00:00 2014 -0500
| |
| |     Co-found a medical records company
| |
| |     Mar 2014 - Dec 2017.
| |
*   commit 0d5e6a8
|\  Merge: 40e5d21 b3f7c12
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Fri Feb 28 17:30:00 2014 -0500
| |
| |     Merge branch 'omni-developers' into main
| |
| |     Four years. Founded a software consulting firm and shipped CMS,
| |     eCommerce, and healthcare web applications for people who paid
| |     with their own money. Started during sophomore year; see the
| |     parallel lane.
| |
| |     Stack: PHP, JavaScript.
| |
| * commit b3f7c12
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Thu Oct 18 14:55:02 2012 -0400
| |
| |     Ship CMS, commerce, and healthcare apps
| |
| |     Requirements gathering, hosting, invoices, and the 11pm phone
| |     call. Full stack meant the whole company.
| |
| * commit cafe101 (tag: role/omni)
| | Author: Kevin Weaver <kevin@kevinweaver.dev>
| | Date:   Mon Feb  1 09:00:00 2010 -0500
| |
| |     Found a software consulting firm
| |
| |     Feb 2010 - Mar 2014. Age 19. Terrible rates. Excellent teacher.
| |
| | * commit 77b0c94 (tag: rowan/bs, side)
| |/  Author: Kevin Weaver <kevin@kevinweaver.dev>
| |   Date:   Fri May 11 10:00:00 2012 -0400
| |
| |       Graduate with a B.S. in MIS
| |
| |       Rowan University. Management Information Systems, minor in
| |       Computer Science. Sep 2008 - May 2012. Overlaps the Omni
| |       branch by two years; the merge was not clean and that was
| |       the point.
| |
* commit 40e5d21 (tag: root)
  Author: Kevin Weaver <kevin@kevinweaver.dev>
  Date:   Tue Sep  2 08:00:00 2008 -0400

      Initial commit

      Empty repository. Good intentions. One semester of Java.
```

### 5.3 The `side` lane — measured-real, optional, recommended

These are real repositories with measured commit counts (M) and they are the only part of
the log that the live graph can corroborate. They belong on a visually distinct lane
(purple/aqua) so a reader can tell paid work from public work at a glance.

```
| * commit 1486a0c (tag: agent/its-applekid)
| | Date:   Thu Jan 29 2026
| |
| |     Initialize a second committer
| |
| |     its-applekid: an agent account with its own GitHub identity and
| |     its own commits. 1,486 contributions in its first 184 days -
| |     730 commits, 603 pull requests, 129 issues. Its work is counted
| |     in the squares above and coloured separately in the tooltip.
| |     Nothing on this page pretends its commits are mine.
| |
| * commit 3b9d0e4
| | Date:   2026, ongoing
| |
| |     Write an Elixir runtime for long-lived agents
| |
| |     aiur-team/aiur. 1,268 commits in 2026 and counting. Most of them
| |     are not mine, which was the design goal.
| |
| * commit 8f21c60
| | Date:   2025 - 2026
| |
| |     Build tools for the Ether Guild
| |
| |     etherguild.xyz and ethismoney.xyz. Public goods, TypeScript,
| |     and a data repo with more stars than the site.
| |
| * commit 6d4e0b2
| | Date:   2025 - 2026
| |
| |     Keep a personal agent honest
| |
| |     its-everdred/gary, 307 commits. And its-everdred/skills, which
| |     is 22 commits of markdown that changed how the other 1,600 got
| |     written.
| |
| * commit 2c7ab95
| | Date:   2023
| |
| |     Win things on weekends
| |
| |     web3-hackathon-template, gachabots, rps-game: what a dozen
| |     hackathons leaves behind. DeFi, NFTs, governance, analytics
| |     dashboards, social and creator tooling.
```

### 5.4 Collapsed rendering — what the `#arc` pane shows by default

Nine rows. Everything else is behind a per-row `<details>` disclosure whose summary is the
oneline and whose body is the indented commit body from §5.2. Field mapping onto the
comp's existing classes, using the unused `.ref` slot:

| `.graph` | `.hash` | `.ref` | `.cyear` | `.cmsg` |
|---|---|---|---|---|
| `●` aqua | `7c4a1e9` | `HEAD -> optimism` | `2025–26` | **Optimism · Actions SDK** — embedded wallets to DeFi, allow/block lists, TS · Hono · Vite · React · Solidity · K8s |
| `◆` purple | `1486a0c` | `tag: agent/its-applekid` | `2026` | **its-applekid initialized** — 1,486 contributions in 184 days, 603 of them pull requests |
| `●` orange | `9c2b7e0` | `main` | `2022–25` | **Metropolis** — tx + deployment engine, tokenization, wallet infra, multi-sig · TS · Next · Solidity · GraphQL |
| `●` yellow | `8ab30f1` | — | `2021–22` | **ConsenSys · Truffle** — L2 bridge boxes, EVM debugging, docs site · 13.9k★, now archived |
| `●` blue | `4c1b8f6` | — | `2017–21` | **Stitch Fix** — customer-facing revenue features at millions of users; org-wide microservice APIs · Ruby · Rails · React · PostgreSQL |
| `●` green | `e9a4b30` | — | `2014–17` | **EMS Heroes** — co-founded; medical records + billing for EMS · Ruby · Rails |
| `●` aqua-d | `0d5e6a8` | — | `2010–14` | **Omni Developers** — founded a consultancy; CMS, eCommerce, healthcare · PHP · JS |
| `●` gray | `77b0c94` | `tag: rowan/bs` | `2008–12` | **Rowan University** — B.S. Management Information Systems, minor Computer Science |
| `●` gray | `40e5d21` | `tag: root` | `2008` | **Initial commit** — empty repository, good intentions |

Pane bar: `git log --graph --decorate --all` on the left (drop the comp's `--since=2021` —
the log is the *whole* career; only the ribbon is five years), `HEAD -> optimism` on the
right, replacing the comp's `HEAD -> main`.

---

## 6. DELIVERABLE — `whoami` pane

`whoami(1)` prints one word, so the pane opens with the honest one-word answer and then
does the real work with `id(1)` and `finger(1)`. The `Project:`/`Plan:` block is a real
finger convention (`~/.project`, `~/.plan`) and is the single most load-bearing joke on the
page for this audience — Carmack's `.plan` files are the reference.

```
$ whoami
its-everdred

$ id
uid=2010(kevin) gid=100(engineers) groups=100(engineers),42(web3),
7(public-goods),13(hackathons),88(podcasters)

$ finger -l its-everdred
Login: its-everdred                      Name: Kevin Weaver
Directory: /home/kevin                   Shell: /usr/bin/zsh
Title: Lead Fullstack Software Engineer
Since: Feb 2010                          Location: California, USA
On since Mon May  5 09:12 2025 on optimism (messages off)
Also logged in as: its-applekid (agent, tty2, since Thu Jan 29 2026)

Project:
    Passionate web3 builder, Ethereum enthusiast, & public goods enjoyer
    designing human coordination tools on the internet's frontier.

Plan:
    Technical architect on the Actions SDK - actions.optimism.io.
    Connecting embedded wallets to DeFi protocols.
    Everything above this line is running. Everything below is history.

No mail.
```

Notes:
- `uid=2010` is the year the career starts, not a birth year. Do not use a birth year.
- `messages off` is a real `finger` field and reads as "heads down" — keep.
- The last `Plan:` line is the hinge between this pane and `#arc`; it is doing IA work,
  not just being cute. Keep it even if other lines get cut.
- **(M)** `its-everdred` account `createdAt` is `2011-09-01T23:00:16Z`, but the career starts
  Feb 2010. `Since: Feb 2010` is correct for the person and deliberately does not match the
  graph. If that bothers anyone, add `GitHub since: Sep 2011` as a fourth field.

---

## 7. DELIVERABLE — `contact` pane

The comp's contact pane is four unlabeled 34px tiles with `title` attributes — invisible to
touch users, invisible to screen readers, and it hides the actual addresses. Replace with a
labeled row. Copy, exactly:

```
REACH ME

  [gh]   github.com/its-everdred                       ◉ human
  [◆]    github.com/its-applekid                       ◆ agent
  [✉]    kevin@kevinweaver.dev                         click to copy
  [in]   linkedin.com/in/kevinweaver
  [@]    x.com/its_everdred

STATUS
  Employed and interested. Remote, America/Los_Angeles.
  Best subject line: something you are stuck on.

  $ curl -sL kevinweaver.dev/resume.txt
  $ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -
```

- Every tile keeps the accessible label as visible text, not a `title=`. `aria-label` on the
  anchor, `rel="me"` on all five for IndieWeb verification, `rel="noopener"` on externals.
- `✉` copies to clipboard on click and falls back to `mailto:` — never a bare `mailto:` as
  the only affordance.
- `STATUS` line is a placeholder pending Kevin's actual answer; see §13.
- The two `curl` lines are the closing joke and the site's best shareable artifact. They
  must actually work — see ticket seeds.

---

## 8. DELIVERABLE — tmux status bar segments

Constraint (M): ASCII + the 16 proven codepoints only; powerline arrows are `clip-path`,
not glyphs; `tmux.css` ships unused `.wins/.win/.win.active/.host/.chev` classes.

### Wide (≥1080px)

| # | classes | literal text | binds to |
|---|---|---|---|
| 1 | `seg session pl` | `kw` | static |
| 2 | `seg wins pl` → three `win` children | `1:whoami` `2:arc` `3:contact` | scroll spy; active window gets `.win.active` **and** a trailing `*` (tmux convention) |
| 3 | `seg host pl` | `git:main` | static |
| 4 | `seg pl` | `kevinweaver.dev` | static |
| 5 | `spacer` | — | — |
| 6 | `seg plr` | `◉ 8,515  ◆ 1,486` | actor totals, measured |
| 7 | `seg plr` | `☰ 2038/2038` | `barPosRef` (see §12.3 on 1826 vs 2038) |
| 8 | `seg plr` | `100%` | `barPctRef` |
| 9 | `seg clock plr` | `Fri 31-Jul-26 09:41` | `barClockRef` |

Active-window example while reading the resume: `1:whoami  2:arc*  3:contact`.

### Narrow (<1080px) — `kw-hide-md` segments 2, 4, 6

`kw` | `git:main` | *spacer* | `☰ 2038/2038` | `100%` | `09:41`

### Narrow (<720px) — additionally `kw-hide-sm` segments 3, 8

`kw` | *spacer* | `☰ 2038/2038` | `09:41`

### Playback-state variants for segment 1

The comp's header pill already carries `live / paused / static`. Mirror it in the session
segment so the state is legible when the header has scrolled away:

| state | segment 1 | colour |
|---|---|---|
| live (parked on today) | `kw` | `--green` |
| rewinding | `kw` | `--aqua` (default `--accent`) |
| paused | `kw` | `--yellow` |
| `prefers-reduced-motion` | `kw` | `--fg4` |

Do **not** change the *text*; changing colour only keeps the bar from reflowing every frame.
The comp's current segment 1 says `NORMAL`, which is a vim modeline, not tmux — if the vim
reference is wanted, put `NORMAL` in a *sixth* left segment, do not overload the session
name.

---

## 9. DELIVERABLE — boot sequence

Replace `prepBoot()` (comp lines 421–435). Sixteen lines at the existing 100ms cadence =
1.6s, inside the existing 2200ms `bootKill`. Kinds map to the existing colour table
(`cmd`→`--fg1`, `ok`→`--green`, `warn`→`--yellow`, `dim`→`--fg4`); one new kind
`agent`→`--purple`.

Pane title: `kevinweaver.dev — cold start`

```
$ boot --target=kevinweaver.dev                                     cmd
  swe-rts-terminal · gruvbox dark medium · jetbrains mono       ok  ok
$ mount /dev/github its-everdred its-applekid                       cmd
  2 actors · 58 public repos · 1 redacted volume                ok  ok
$ fetch contributions --since=2021 --merge=sum-per-day              cmd
  ⠿ 10,001 contributions across 2,038 days                      ok  ok
  1,179 active · busiest 284 on 17 may 2026                         dim
$ bin --log2 --steps=10                                             cmd
  quantile rejected: 375-day mass point at n=1                      warn
  doubling bands accepted                                       ok  ok
$ seek --to=now --reverse                                           cmd
  playback runs backwards. newest first.                            dim
  the longer you stay, the further back you get                     dim
◆ its-applekid online since 29 jan 2026                             agent
$ render whoami arc contact                                         cmd
  ready.                                                            ok
```

Rules the implementer must keep:
- The whole overlay is `onClick={onSkipBoot}` already — keep it, and add `Esc` and any
  keypress. A boot animation you cannot skip is the one thing that makes this aesthetic
  obnoxious.
- `prefers-reduced-motion` already skips boot entirely (`this.state.booting` guard, comp
  line 206). Keep that; do not "reduce" it to a slower version.
- Show boot at most once per session (`sessionStorage`). A returning visitor watching the
  same 1.6s log is a cost, not a feature.
- Every number in the boot log is measured. If a number changes, the log must change with
  it — wire them from the same data object that feeds the ribbon, never hardcode twice.

---

## 10. DELIVERABLE — title, meta, cards, OG image

### 10.1 `<title>`

```
Kevin Weaver — Lead Fullstack Software Engineer
```

Name first, capitalized, real title. The terminal-native alternative
`kevin@kevinweaver.dev: ~` is better in a tab strip and worse in every search result and
every shared link. **Recommendation: ship the SEO title in `<title>`, then swap
`document.title` to the terminal form after the first user interaction**, and to
`kevin@kevinweaver.dev:~$ arc` etc. on section change. Best of both, costs four lines.

### 10.2 Meta description (150 chars, measured — inside Google's ~155–160 truncation)

```
Kevin Weaver, lead fullstack software engineer. Web3 builder, Ethereum enthusiast, public goods enjoyer. Sixteen years of commits, replayed backwards.
```

### 10.3 OpenGraph / Twitter

```html
<meta property="og:type"        content="profile">
<meta property="og:site_name"   content="kevinweaver.dev">
<meta property="og:url"         content="https://www.kevinweaver.dev/">
<meta property="og:title"       content="Kevin Weaver — Lead Fullstack Software Engineer">
<meta property="og:description" content="Sixteen years of commits, replayed backwards. Web3 builder, Ethereum enthusiast, public goods enjoyer, building coordination tools on the internet's frontier.">
<meta property="og:image"       content="https://www.kevinweaver.dev/og.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt"   content="A gruvbox terminal showing five years of Kevin Weaver's GitHub contribution grid, with a purple band marking where an AI agent account joined in January 2026.">
<meta property="profile:first_name" content="Kevin">
<meta property="profile:last_name"  content="Weaver">
<meta property="profile:username"   content="its-everdred">

<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:site"        content="@its_everdred">
<meta name="twitter:creator"     content="@its_everdred">
<meta name="twitter:title"       content="Kevin Weaver — Lead Fullstack Software Engineer">
<meta name="twitter:description" content="Sixteen years of commits, replayed backwards. Two committers: one human, one agent.">
```

`twitter:site` / `twitter:creator` are pending §12.6 (handle conflict).

### 10.4 OG image concept

**Concept: the card is a screenshot of the site's own status line and ribbon, generated from
live data.** Not a portrait, not a logo. The pitch is "this person's work is a legible
dataset" and the card should *be* the dataset.

1200×630, `--bg-h #1d2021`, 1px `--bg1` pane border inset 24px, `--scanline` overlay at
0.35 multiply (identical to the site's fixed overlay, comp line 50).

- **Top left**, JetBrains Mono ExtraBold 68px `--fg0`: `kevin weaver`
- Directly under, 26px `--fg3`: `lead fullstack software engineer`
- Under that, 20px `--fg4`: `typescript · solidity · react · elixir · ethereum`
- **Center band, 1000×230**: the real 53×7 contribution ribbon for the last year, log2
  green ramp, with the purple `its-applekid` sub-band, and the `◆ agent initialized`
  hairline visible at 29 jan 2026. This is the whole image.
- **Bottom edge, full bleed 44px**: a real tmux status bar — `kw` in `--aqua` on
  `--bg-h`, `git:main`, `kevinweaver.dev`, spacer, `◉ 8,515  ◆ 1,486`, `☰ 2038/2038`,
  clock. Powerline arrows as SVG polygons.
- No avatar. The `public/images/kevin.png` pixel-art avatar belongs in the *graph* as the
  `kw` actor token (prior research flagged it as the one salvageable asset), not on the card
  where it competes with the ribbon.

**Implementation constraint (I, but concrete):** `@vercel/og` runs satori on the Edge and
satori has **no canvas** — every ribbon cell must be an SVG/JSX `<div>` or `<rect>`, which
is 371 elements for a year at 53×7. That is within satori's budget but must be flat, and
JetBrains Mono must be supplied as an `ArrayBuffer` (satori will not fetch Google Fonts).
**Ship a static `public/og.png` fallback regardless** — a card that 500s renders as no card
at all, and that failure is silent on every platform that matters.

Also emit `<link rel="alternate" type="text/plain" href="/resume.txt">` and a `<noscript>`
block containing the §5.2 log and the §4 man page. The site is a canvas animation; without
that block it has **zero indexable text**, which is a real and permanent SEO outcome.

---

## 11. Do-not-publish flags

### 11.1 Phone number `856-723-2521` — **DO NOT PUBLISH. No obfuscation is sufficient.**

- It is a live personal number. Scrapers harvest `tel:` and bare NANP patterns within hours
  of first crawl; the downstream is SMS spam, voice phishing, and — because the number is
  almost certainly an account-recovery factor — SIM-swap targeting for someone who publicly
  works on crypto infrastructure. That last clause is why this is not a normal privacy nit.
- Image-rendering, ROT13, and JS-assembly all fail: OCR and headless execution are standard
  in scraping pipelines, and each of them also breaks the number for the one human who
  legitimately wanted it.
- The audience is engineer peers. **Zero of them want a phone number.** Recruiters who need
  it get the PDF.
- Minor supporting signal: **856 is a South Jersey area code** while the resume states
  California — consistent with a legacy number carried from the Rowan/EMS Heroes era, which
  makes it *more* likely to be tied to old accounts, not less.
- **Recommendation:** omit entirely. If a synchronous channel is wanted, put a Cal.com link
  in the contact pane.

### 11.2 Email — three candidates, one recommendation

| Address | Status | Verdict |
|---|---|---|
| `notkevinweaver@gmail` (as written on the resume) | **Missing TLD** — not a deliverable address, not a valid `mailto:` | Do not publish as-is |
| `kevinweaver2@gmail.com` (owner's address on file) | Valid, personal | **Do not publish without an explicit decision** |
| `kevin@kevinweaver.dev` | Does not exist yet; domain is owned | **Recommended** |

- The missing TLD reads two ways: deliberate anti-scrape obfuscation, or a typo. On a resume
  for a detail-oriented staff-level role, *both readings cost something* — the second is a
  typo, and the first looks like a typo to anyone who does not already know the trick.
- `kevinweaver2@gmail.com` is a personal Gmail and is very likely the recovery address for
  other accounts. Publishing a recovery address next to a public crypto-engineering identity
  meaningfully raises phishing and credential-stuffing exposure. **Flagging explicitly, per
  instruction: this address must not go on the site unless Kevin says so out loud.**
- `kevin@kevinweaver.dev` is domain-scoped, forwardable to whatever inbox he actually reads,
  rotatable if it leaks, and reinforces the site. It is also what the git-log author line
  wants to say. Set up forwarding privately; publish only the alias.
- Confirm separately whether `notkevinweaver@gmail.com` (with TLD) is a real mailbox he
  wants public — if yes, publish it *with* the TLD.

### 11.3 Location

`California, USA` is correctly coarse. Do not narrow to a city, and do not let the tmux
clock leak a finer timezone than `America/Los_Angeles`.

### 11.4 The `its-applekid` disclosure is a choice, not an accident

Publishing that an AI agent account co-authors your contribution graph will read to most of
this audience as unusual honesty and to a minority of hiring processes as inflated numbers.
**Recommendation: keep it, and make it louder, not quieter** — separate colour band, exact
per-actor counts in the tooltip, an explicit line in the man page BUGS section, and the
`◆ agent` label in the contact pane. The comp already does this correctly. The honesty is
the pitch; a buried disclosure would be the only version that hurts.

### 11.5 The redacted blob leaks a pattern, not content

`restrictedContributionsCount` per year (M: 105 / 86 / 1,028 / 2,360 / 998 / 488) is
publishable — it names nothing. But the *shape* over time is an employer activity signal.
Low risk; the mitigation is free: **label the cluster `private repos` and never the
employer**, and do not render per-day private counts at day resolution in the tooltip.

---

## 12. Factual tensions to resolve with Kevin

### 12.1 (M) `kevinmweaver.com` is not a website

```
$ getent hosts kevinmweaver.com   → 192.64.119.101
$ curl -sI -m 15 https://kevinmweaver.com  → Connection timed out after 15003 ms
$ curl -sI -m 15 http://kevinmweaver.com
  HTTP/1.1 302 Found
  Location: https://y.at/ufo.laptop.coffee
  X-Served-By: Namecheap URL Forward
```

HTTPS does not answer at all; HTTP is a Namecheap URL forward to a Yat emoji handle. The
resume's `Web: kevinmweaver.com` therefore points a reader at a hard TLS timeout.
**Recommendation: replace with `kevinweaver.dev` everywhere, and either point
`kevinmweaver.com` at the same site or let it go.** Do not link it.

### 12.2 (M) The comp's career ≠ the real career

Covered in §0. Concretely, the following comp strings must be deleted, not edited:
line 137 (`the front end of ethereum.org and the ethereum foundation site`), line 138
(`now aiur ... most of its commits are not mine` — true, but it is a side project, not the
current role), and git-log rows at lines 149–157. `this.repos` (lines 277–297) must be
regenerated from the measured repo list; five of its entries do not exist.

Measured drive-by OSS contributions, for accurate copy: `ethereum/ethereum-org-website`
1 commit + 1 PR (2023); `ethereum/ethereum-foundation-website` 1 PR (2026);
`wevm/create-wagmi` 1 PR (2023); `Uniswap/v3-core` 1 PR (2024);
`its-everdred/openzeppelin-contracts` and `snapshot-strategies` 1 PR each (2022). These are
good and worth a small "drive-by" cluster. They are not a role.

### 12.3 (M) The 1,826-day window does not match the measured totals

The comp hardcodes `☰ 1826/1826` and a window of `2021-08-01 → 2026-07-31` (comp lines 178,
273–274). Prior measured research covers `2021-01-01 → 2026-07-31` = **2,038 days /
10,001 contributions / 375 level-1 days / 859 zero days**. The comp's boot log quotes
`4,817 contributions · 17 zero days · 156-day mass point`, which are the **370-day** figures
from that same research, not five-year figures.

**Recommendation: set the window to 2021-01-01 → today (2,038 days).** Then `☰ 2038/2038`,
`10,001`, `375`, and `859` are all internally consistent and all measured, and §9's boot log
is literally true. Otherwise every number must be recomputed for 1,826 days.

### 12.4 (M) Company naming

Resume says "Metropolis"; the GitHub org is `0xmetropolis` and hosts `metal`, `contracts`
(★36), `subgraph`, `metro-sdk`, `nft-microsite`, `erc20`, `v3-core`. Render as
**"Metropolis (0xmetropolis)"** on first mention so the graph nodes and the log agree.

### 12.5 (M) ConsenSys repos are archived, and the resume undersells the L2 work

All Truffle repos now live under `ConsenSys-archive/*`: `truffle` ★13,923,
`trufflesuite.com` ★180, `tutorialtoken-box` ★56, `polygon-box` ★39, `arbitrum-box` ★23,
`optimism-bridge-box` ★2. Kevin's largest single public body of work in 2021–22 was
**45 commits to `optimism-bridge-box`** — which directly corroborates the resume's "L2
bridging" line and is a nice arc into the current Optimism role. Say so. And say "now
archived" about Truffle rather than letting a reader discover it; a 13.9k-star tool that was
sunset is a *fact about the ecosystem*, not about him.

### 12.6 (M) Twitter handle conflict

Resume says `@kevin_weaver`. GitHub profile field `twitterUsername` says **`its_everdred`**.
The comp's contact pane says `@its_everdred`. Pick one; §7 and §10.3 currently assume
`its_everdred` because that is the measured, self-set value.

### 12.7 Three different job titles

Resume header: "Lead Fullstack Software Engineer". Current role (resume body): "Senior Full
Stack Software Engineer". GitHub bio (M): "Lead blockchain engineer, Ethereum enthusiast,
pixel art pundit, coffee consumer". §4 and §6 use the resume header. If the intent is to
signal availability for lead/staff roles, that is right; if the intent is accuracy about
*today*, the whoami `Title:` should say Senior and the header claim should be dropped.

### 12.8 "Serial Podcaster" has no artifact

The skill is claimed with no podcast name, feed, or link. Either name it (and link it from
`--podcast` in §4) or cut the option. An unlinkable credential on a page that otherwise
proves everything with live data is the one soft spot a skeptical reader will find.

### 12.9 GitHub predates the career by 19 months

Account created `2011-09-01` (M); career starts Feb 2010. The graph structurally cannot show
the Omni years. This is fine and expected — but it means the git log is the *only* evidence
for 2010–2011, which is another argument for making §5 excellent rather than decorative.

---

## 13. Open decisions that block copy freeze

1. Email alias — §11.2. Blocks the contact pane, the git author line, and `resume.txt`.
2. Availability string in `STATUS` — §7. "Employed and interested" is a placeholder.
3. Twitter handle — §12.6.
4. Whether the `side` lane (aiur / etherguild / gary) appears at all — §5.3. It is measured
   and strong, and it is also the part the resume omits.
5. Podcast name/URL — §12.8.
6. Window: 1,826 vs 2,038 days — §12.3. Blocks the boot log and the tmux position segment.
7. Whether `kevinmweaver.com` gets redirected to `kevinweaver.dev` — §12.1.

---

## 14. Verification still owed

- **Glyph coverage.** The local machine only has the *Nerd Font patched* JetBrains Mono
  (`fc-match` → `JetBrainsMonoNerdFont-Regular.ttf`, M), which has everything; the site will
  load upstream Google-hosted JetBrains Mono, which does not. `fontTools` is not installed
  and the Google Fonts CSS fetch returned empty from this sandbox, so `⏸ ▶ ⏮ ⏭ ✉ ☰ ⠿ ◉ ◆ ★`
  are **unverified against the shipping font (I)**. Run a `document.fonts` + canvas
  `measureText` width-comparison test against a known-missing codepoint before shipping any
  of them; every one of these appears in the comp's controls.
- LinkedIn vanity `linkedin.com/in/kevinweaver` — unverified; LinkedIn blocks unauthenticated
  fetches.
- Whether `notkevinweaver@gmail.com` (with TLD) is a live mailbox.

---

# Verification corrections

Appended 2026-07-31 by an adversarial verifier. Every line below was re-measured
independently. Commands are given verbatim. Nothing above this heading was edited.

## C1. **REFUTED (critical)** — §3's "the current role is 100% private" is a measurement of the *token*, not of Kevin

`ethereum-optimism/actions` is a **public repository** and `its-everdred` is its **top
contributor by an order of magnitude**.

```
$ curl -s https://api.github.com/repos/ethereum-optimism/actions
  full_name=ethereum-optimism/actions  private=false  stars=31  forks=22
  description="DeFi Actions SDK for the OP Stack"
  created_at=2025-07-18T23:30:10Z   pushed_at=2026-07-31T22:47:57Z

$ curl -s https://api.github.com/repos/ethereum-optimism/actions/contributors
  its-everdred 2198 | tremarkley 193 | jefr90 67 | dependabot 16 |
  github-actions 11 | falcorocks 10 | tarunkhasnavis 6 | raffaele-oplabs 3

$ curl -s "https://api.github.com/search/commits?q=author:its-everdred+org:ethereum-optimism"
  total_count = 2324        (repos seen in first page: actions, docs, supersim)
$ curl -s ".../search/issues?q=repo:ethereum-optimism/actions+author:its-everdred+is:pr"
  total_count = 138
$ curl -s ".../search/issues?q=org:ethereum-optimism+author:its-everdred+is:pr"   -> 165
$ curl -s ".../search/issues?q=org:ethereum-optimism+author:its-everdred"         -> 373
```

Why §3 got `issueCount: 0`: the local `gh` token is **not SAML-SSO-authorized** for that org,
and GitHub's authenticated search returns an empty set rather than an error.

```
$ gh api repos/ethereum-optimism/actions
  HTTP 403 — "Resource protected by organization SAML enforcement.
  You must grant your OAuth token access to this organization."
```

`gh api graphql` search for the same query still returns `issueCount: 0` with no warning.
**Any authenticated GitHub measurement in this project that touches `ethereum-optimism` is
invalid until the token is SSO-authorized. Prefer unauthenticated REST for that org.**

Consequences:

- §3's escalation ("the opening frame is a blurred redacted blob", "the site's first
  impression is grey") is **false**. Under backwards playback the newest frame contains
  `ethereum-optimism/actions` (public, TypeScript, 2,198 commits by Kevin, last push today)
  alongside `aiur` — the single strongest frame on the site, not the weakest. Neither
  proposed mitigation (named dashed-interior node / 2s delay) is needed.
- `its-applekid/actions` is a **public fork** of it (2,453 commits, 43 PRs from
  `its-everdred`) — the agent actor is *also* visibly working on the current job.
- §4's man page, §5.2's git log and §5.4's table all describe the Optimism role as
  evidence-free. `4e88c02`'s body line "this branch is not merged. It is still being
  written" is fine as a gag but the log gives 2,198 public commits no row while giving
  `its-everdred/gary` (305) one in §5.3. **Rebalance.**

## C2. **REFUTED** — §0 and §12.2: the comp's `this.repos` entries are not nonexistent

§0's table row "`its-applekid/agent-actions`, `vector-eth` — **do not exist**" and §12.2's
"five of its entries do not exist" are both wrong. 18 of the 19 entries resolve:

```
$ for r in <all 19 ids>; do gh api repos/$r --jq .full_name; done
its-applekid/agent-actions   200  ★1  "Safe DeFi for AI agents — on-chain spending
                                       limits, session keys, ZeroDev smart accounts"
its-applekid/vector-eth      200  ★0  "Retro Star Fox style 3D Ethereum logo w/ Three.js"
its-applekid/ethereum-archive 200 ★1  |  its-applekid/applekid-pi 200 ★0
0xmetropolis/{metal,contracts,subgraph,metro-sdk} 200 (★4/36/6/9)
ethereum/{ethereum-org-website,ethereum-foundation-website} 200
etherguild/etherguild.xyz 200 | aiur-team/aiur 200 | its-everdred/{gary,skills} 200
sapsaldog/claude-app-server 200
ConsenSys/truffle            -> 301 ConsenSys-archive/truffle          (exists, ★13,923)
trufflesuite/trufflesuite.com-> 301 ConsenSys-archive/trufflesuite.com (exists, ★180)
truffle-box/templates        404  <-- the ONLY nonexistent entry
```

The comp's fiction is in the **`vol` and `f`/`t` fields**, not the `id` fields — and the comp
says so itself at line 265: `/* mock data, shaped to the real distributions */`. Restate the
remedy: regenerate `this.repos` because the *volumes and date spans* are seeded LCG mock
data, not because the repos are invented. (The comp's `0xmetropolis/metal vol:286 st:31`
vs. measured ★4 is a good example.)

§0's core conclusion — that the man-page DESCRIPTION and the git-log rows encode roles Kevin
never held — **survives**: `ethereum/ethereum-org-website` really is 1 commit + 1 PR (2023)
and `ethereum-foundation-website` really is 1 PR (2026). Confirmed. The evidence for it was
just partly wrong.

## C3. **REFUTED** — §9/§8/§12.3: every contribution total in this document is ~25% low

Same SAML root cause as C1. `contributionsCollection` (authenticated) omits the
`ethereum-optimism` org silently; the **public, unauthenticated profile calendar** does not.

```
$ curl -s "https://github.com/users/<u>/contributions?from=<y>-01-01&to=<y>-12-31"
  # parsed <td data-date> + <tool-tip> pairs, summed per day across BOTH actors
```

| year | authenticated `contributionCalendar` | public profile calendar |
|---|---|---|
| 2021 | 318 | 325 |
| 2022 | 233 | 237 |
| 2023 | 1,279 | 1,294 |
| 2024 | 2,454 | 2,459 |
| **2025** | **1,443** | **2,695** |
| **2026 (to 07-31)** | **2,791** | **4,838** |

2021–2024 agree within 4–15 (timezone edge effects). The divergence begins **exactly when the
Optimism role begins (May 2025)**.

Corrected figures for the recommended 2021-01-01 → 2026-07-31 window:

| quantity | this doc says (M) | **measured** |
|---|---|---|
| days | 2,038 | 2,038 ✓ |
| total contributions | 10,001 | **13,360** |
| active days | 1,179 | **1,210** |
| zero days | 859 | **828** |
| days at exactly 1 | 375 | **274** |
| busiest day | 284 on 2026-05-17 | ✓ confirmed |
| per-actor split `◉ / ◆` | 8,515 / 1,486 | **11,848 / 1,512** |

**§9's boot log and §8's segment 6 must be rewritten.** Specifically
`⠿ 10,001 contributions across 2,038 days` → `13,360`; `1,179 active` → `1,210`;
`quantile rejected: 375-day mass point at n=1` → `274-day`; `◉ 8,515  ◆ 1,486` →
`◉ 11,848  ◆ 1,512`. §9's own rule ("every number in the boot log is measured") is currently
not satisfied by §9.

Note the log2 band table in `2026-07-31-measured-findings.md` is derived from the same
undercounted data and must be re-binned. (Its prose "156 days sit at exactly 1" and its table
"level 1 = 375 days" already contradict each other; neither is the measured value, 274.)

## C4. **REFUTED** — §12.3's claim that the comp's boot numbers are "the 370-day figures"

Measured over the trailing 370 days (2025-07-27 → 2026-07-31, both actors):
**7,933 contributions · 3 zero days · 69 days at n=1 · busiest 284.**
Trailing 365 days: 7,860 · 3 · 68.

The comp prints `4,817 contributions · busiest 284 · 17 zero days` and
`156-day mass point at n=1`. **None of these are 370-day figures**, and the strings "370",
"4,817" and "17 zero" appear nowhere in `2026-07-31-measured-findings.md`. They are output of
the comp's seeded mock generator. §12.3's "which are the 370-day figures from that same
research" is an **inference presented as (M)**; delete it.

The 1,826-day window is also not internally impossible, as §12.3 implies. Measured over the
comp's own window (2021-08-01 → 2026-07-31, 1,826 days): **13,147 contributions · 685 zero
days · 249 days at n=1.** Confirmed arithmetic: comp `Date.UTC(2021,7,1)` → 2026-07-31
inclusive **= 1826** exactly; 2021-01-01 → 2026-07-31 inclusive **= 2038** exactly. The
recommendation to move to 2,038 is fine; the justification "otherwise the numbers can't be
made consistent" is not.

## C5. **REFUTED (partial)** — §11.2: `kevin@kevinweaver.dev` mail is already provisioned at DNS

```
$ curl -s "https://dns.google/resolve?name=kevinweaver.dev&type=MX"
  10 eforward1.registrar-servers.com.   10 eforward2...   10 eforward3...
  15 eforward4...                       20 eforward5.registrar-servers.com.
```

The domain already runs **Namecheap Email Forwarding**. §11.2's "Does not exist yet" is
misleading as an infrastructure statement: creating the `kevin@` alias is a registrar-panel
row, not a new service, and it is not a meaningful blocker on the git-log author line.
Whether the specific `kevin@` alias is already configured is **not determinable from DNS**
(unproven either way) — verify in the Namecheap panel, not by inference.

Everything else in §11.1/§11.2/§11.3 stands. Area code **856 confirmed as southwestern
New Jersey** (Camden / Cherry Hill / Glassboro — Glassboro is Rowan), consistent with §11.1's
legacy-number argument.

## C6. **UNPROVEN** — §9's "58 public repos"

Not reproducible under any definition measured:

```
$ gh api graphql  user(its-everdred) repositories(privacy:PUBLIC)                  -> 85
                                     repositories(privacy:PUBLIC,isFork:false)     -> 56
                                     repositories(ownerAffiliations:OWNER,PUBLIC)  -> 77
$ curl -s https://api.github.com/users/its-everdred  .public_repos                 -> 77
$ curl -s https://api.github.com/users/its-applekid  .public_repos                 ->  8
```

Combined owner-public = 85; combined non-fork = 61. Pick a definition, state it in the doc,
and wire the boot line to it.

## C7. Minor drift and one overstatement

- §5.3 / §5.4 / §8: `its-applekid` is now **1,488** contributions, **730** commits,
  **605** PRs, 129 issues, 15 reviews (doc says 1,486 / 730 / 603). These move daily —
  never hardcode them in copy.
- §5.3 "`its-everdred/gary`, 307 commits": default-branch history is **305**
  (`repository(...).defaultBranchRef.target.history.totalCount`). 307 = 247 (2025) + 60
  (2026) *contribution events*, which is a different quantity. Say which.
- §12.5 "45 commits to `optimism-bridge-box` — the largest single public body of work in
  2021–22": **45 is confirmed** and is the largest in **2022** and the largest in any
  ConsenSys repo — but `its-everdred/blocktracker-js` has **58 commits in 2021**, so the
  literal "2021–22" superlative is wrong. Narrow it to 2022, or to "at ConsenSys".

## C8. Confirmed (M) claims — re-measured, all correct

`its-everdred.createdAt = 2011-09-01T23:00:16Z`; `twitterUsername = its_everdred`; GitHub bio
string exact; `restrictedContributionsCount` 105 / 86 / 1,028 / 2,360 / 998 / 488;
`ethereum-org-website` 1 commit + 1 PR (2023); `ethereum-foundation-website` 1 PR (2026);
`wevm/create-wagmi` 1 PR (2023); `Uniswap/v3-core` 1 PR (2024); `aiur-team/aiur` 1,268 commits
(2026); `its-everdred/skills` 22 commits; `truffle` ★13,923 archived, `trufflesuite.com` ★180,
`tutorialtoken-box` ★56, `polygon-box` ★39, `arbitrum-box` ★23, `optimism-bridge-box` ★2,
`0xmetropolis/contracts` ★36; busiest day 284 on 2026-05-17.

`kevinmweaver.com` → `192.64.119.101`; HTTPS **times out** (`curl -sI`, exit 124 at 20s);
HTTP returns `302 → https://y.at/ufo.laptop.coffee`, `X-Served-By: Namecheap URL Forward`.

Comp/design-system claims, all verified against
`docs/design/_ds/swe-rts-terminal-design-system-*/layers/`:
`.commit .ref{flex:0 0 auto;color:var(--text-faint);}` exists in `data.css` and the comp uses
it **0** times; `.tmux .wins/.win/.win.active/.host/.chev` exist in `tmux.css` and the comp
uses them **0** times; `.pane-body{...;overflow:hidden;}` confirmed in `pane.css`;
`tmux.css` lines 1–5 do say the arrows are `clip-path` because "Google-hosted JetBrains Mono
ships no Nerd Font PUA range".

Codepoint histogram over the whole comp: **0 characters in U+E000–U+F8FF**, exactly **16**
distinct non-ASCII codepoints, matching §1.1's list precisely
(`· — • – ◆ ● → ⏸ ☰ ⠿ ◉ ⏮ ⏭ ✉ ★ ▶`). §1.1 is sound.

Comp `0xc0de1` (line 153) is confirmed **not valid hex**. All 33 SHAs invented in §5 are
valid `[0-9a-f]{7}`, unique, with **no shared 2-character prefixes**. All **28** `Date:` lines
in §5.2/§5.3 have the **correct weekday** for their date. §10.2's meta description is
**exactly 150 characters**. (`og:description` is 158 — untagged in the doc, worth noting.)
