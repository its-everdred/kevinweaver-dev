/**
 * Contribution density bands, one fill per band of the payload's `grid.bands`
 * ladder — ten log2-doubling bounds, `0 1 2 4 8 16 32 64 128 256`, every one of
 * which the real bundle reaches. Four greens could not say how big a day was
 * once it passed eight commits, so the ramp runs the whole ladder and climbs in
 * even steps of lightness: the scale reads the same in greyscale as it does in
 * colour, and no two bands land on the same fill.
 *
 * Band 0 is the empty day, and the greens start just above it rather than below
 * it. GitHub's own darkest, #0e4429, is *darker* than this grey, which put a
 * visible hole at the bottom of the scale; #3f5a48 sits a little above it, so
 * the ramp starts where "nothing" ends.
 *
 * Concrete hex, never CSS tokens: the canvas 2D API does not resolve `var()`,
 * it just paints the fallback black.
 */
export const LEVEL_COLORS = [
  '#504945',
  '#3f5a48',
  '#3f694d',
  '#3e7851',
  '#3d8754',
  '#3c9656',
  '#3aa557',
  '#39b457',
  '#38c456',
  '#39d353',
] as const

/** Year label and boundary rule: 5.898:1 on the #1d2021 pane surface. */
export const MARKER_COLOR = '#a89984'
/**
 * The current day's ring, over a dark separator. Between them the two cover the
 * whole ramp: the bright stroke carries the dark end, where the separator has
 * nothing to say, and the separator carries the bright end, where #39d353 would
 * swallow the stroke.
 */
export const CURRENT_RING = '#fbf1c7'
export const CURRENT_SEPARATOR = '#1d2021'
