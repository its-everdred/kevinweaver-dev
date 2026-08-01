# Control icons

These inline SVG icons replace the control glyphs in the design comp. They use
JetBrains Mono's companion control set as authored 24x24 path data, with
`fill-rule="evenodd"` and `fill="currentColor"`. The `Icon` primitive always
emits `aria-hidden="true"` and `focusable="false"`; accessible names belong on
the surrounding button or link.

## Font vendor

The font files in `public/fonts/` come from `@fontsource-variable/jetbrains-mono`
version `5.3.0`, licensed under SIL Open Font License 1.1. The shipped subset
is latin-only and is accompanied by `public/fonts/OFL.txt`.

## Glyph map

| Codepoint | Glyph | `ICON_PATHS` key / component            | Comp site                               | Consuming ticket         |
| --------- | ----- | --------------------------------------- | --------------------------------------- | ------------------------ |
| U+23F8    | ⏸     | `pause` / `PauseIcon`                   | `:106` play button, `:1000` `onToggle`  | KW-026                   |
| U+25B6    | ▶     | `play` / `PlayIcon`                     | `:1000` `onToggle` paused state         | KW-026                   |
| U+23EE    | ⏮     | `skipStart` / `SkipStartIcon`           | `:111` `⏮ 2021`                         | KW-026                   |
| U+23ED    | ⏭     | `skipEnd` / `SkipEndIcon`               | `:113` `⏭ live`                         | KW-026                   |
| U+2630    | ☰    | `menu` / `MenuIcon`                     | `:178` and `:975` tmux `☰ 1826/1826`   | KW-018                   |
| U+2709    | ✉     | `mail` / `MailIcon`                     | `:167` contact tile                     | KW-019                   |
| U+283F    | ⠿     | `spinner` / `SpinnerIcon`               | `:424`, `:426` boot console lines       | KW-020                   |
| U+25C9    | ◉     | `commit` / `CommitIcon`                 | `:700`, `:925` log-tail and commit rows | KW-017, KW-025           |
| U+2605    | ★     | `star` / `StarIcon` + `ICON_PATHS.star` | `:822` `g.fillText('★ ' …)` on canvas   | KW-022 (canvas `Path2D`) |

The text glyphs `· — • – → ◆ ●` remain text by design. `→ ◆ ●` are outside
the shipped latin subset's `cmap` and use the `ui-monospace, SFMono-Regular,
Menlo, monospace` fallback stack. They have no control semantics and appear in
running text, so they are intentionally not replaced here.

Canvas consumers should import `ICON_PATHS`, construct a `Path2D` once outside
the frame loop, and fill it with the `evenodd` rule.
