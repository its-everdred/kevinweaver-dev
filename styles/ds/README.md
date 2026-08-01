# SWE RTS terminal CSS

## Provenance

Vendored on 2026-08-01 from design-system project
`583945d5-2203-4320-8a4e-b30afe61181d`. Upstream paths below are relative to
`docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/`.

| Vendored file           | Upstream source         |
| ----------------------- | ----------------------- |
| `tokens/colors.css`     | `tokens/colors.css`     |
| `tokens/typography.css` | `tokens/typography.css` |
| `tokens/spacing.css`    | `tokens/spacing.css`    |
| `tokens/effects.css`    | `tokens/effects.css`    |
| `layers/base.css`       | `layers/base.css`       |
| `layers/type.css`       | `layers/type.css`       |
| `layers/pane.css`       | `layers/pane.css`       |
| `layers/tmux.css`       | `layers/tmux.css`       |
| `layers/data.css`       | `layers/data.css`       |

All files in the table are byte-identical copies. `tokens/fonts.css` is intentionally
excluded: it references absent font binaries, while font delivery belongs to the font
integration work. All web adaptations are in `web.css`.

## Deviation ledger

1. **D1, `tokens/typography.css`:** replaces the slide-scale type values with a rem-based,
   fluid 360px to 1560px ladder. It adds `--fs-prose`, `--lh-prose`, and `--lh-chrome`.
2. **D2, `tokens/spacing.css`:** replaces slide-scale geometry with rem-based responsive
   values, adds pane padding variants and traffic-light dimensions.
3. **D3, `layers/pane.css`, `layers/data.css`, and `layers/tmux.css`:** re-derives pane
   bars, commit columns, rails, dots, and tmux height for web density and text-spacing
   resilience.
4. **D4, `layers/tmux.css`:** closes powerline seams for every `--pl-w` value and derives
   post-arrow padding from that token.
5. **D5, `tokens/colors.css`, `layers/pane.css`, and region-owned chrome:** maps shared
   comment and pane-bar text to passing semantic colours. Region work must use `--fg3` for
   transport text on `--bg1`, lift the init control surface to `--bg-h`, and use `--fg1` on
   tmux position segments over `--bg2`.
6. **D6, `tokens/effects.css`:** sets default scanline opacity to `0.20`, provides the
   `data-scanline="off"` hook, and disables scanlines for `prefers-contrast: more`.

## Contrast ledger

| Pair                                           | Before |                            After |
| ---------------------------------------------- | -----: | -------------------------------: |
| bg4 `#7c6f64` on bg-h `#1d2021` (weekday)      |  3.369 |                  5.898 (`--fg4`) |
| gray `#928374` on bg-h `#1d2021` (month/year)  |  4.467 |                  5.898 (`--fg4`) |
| fg4 `#a89984` on bg1 `#3c3836` (transport)     |  4.171 |       5.323 (`--fg3` on `--bg1`) |
| purple `#d3869b` on bg1 `#3c3836` (init)       |  4.226 |   5.975 (`--purple` on `--bg-h`) |
| fg3 `#bdae93` on bg2 `#504945` (tmux position) |  4.050 |       6.432 (`--fg1` on `--bg2`) |
| fg4 `#a89984` on bg1 `#3c3836` (`.pane-bar`)   |  4.171 |             5.323 (`--text-dim`) |
| bg2 `#504945` on bg-h `#1d2021` (scrollbar)    |  1.858 |                  3.369 (`--bg4`) |
| focus ring fg0 `#fbf1c7` on bg-h/bg0/bg1/bg2   |    n/a | 14.451 / 12.994 / 10.220 / 7.777 |

The palette is bridged with `@theme inline` so section-local `--accent` values remain live
for Tailwind `text-accent`, `bg-accent`, and `border-accent` utilities. `text-body` is the
Tailwind font-size utility, while `text-text-body` is the colour utility.

The browser floor is Safari 16.4+, Chrome 111+, and Firefox 128+: Tailwind requires modern
CSS primitives, while the vendored base layer already uses `color-mix()`.
