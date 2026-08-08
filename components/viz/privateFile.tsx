'use client'

import type { ReactNode } from 'react'

/**
 * The redaction's styling, concatenated into the log's own stylesheet so the
 * whole of this treatment lives beside the fabrication it covers.
 *
 * `filter: blur()` rather than `color:transparent` plus a `text-shadow` halo:
 * the halo leaves axe computing contrast against a transparent foreground,
 * where blur leaves `color` exactly as a real row declares it and axe measures
 * what it already measures on the rest of the log. The blur is not consulted.
 *
 * 0.3em is ~3px over 10-11px `--fs-micro` text, enough to smear glyphs past
 * reading at any breakpoint because it scales with the type rather than being
 * pinned to one pixel count.
 *
 * Cost: `useRowCapacity` clamps the pane to 40 mounted rows, so the busiest
 * day's 1,387 contributions churn text through at most 40 filtered spans rather
 * than mounting 1,387 of them, and the reveal repaints on requestAnimationFrame
 * (<=60/s) rather than once per contribution. Rows are keyed by their position
 * in the day, so a window that slid by one line rewrites text nodes instead of
 * tearing down and rebuilding 40 filtered layers.
 */
export const PRIVATE_FILE_CSS = `
.kw-events .e .redact{filter:blur(0.3em);}
`

/**
 * What a synthesized row says to anyone who is not looking at it. The path on
 * screen is invented, so announcing it would tell a listener a story only the
 * blur stops a sighted viewer from believing. This is the truth in its place,
 * and it covers the repo column too, which is why the caller hides that column
 * alongside rather than leaving it to announce a redundant second `private`.
 */
const PRIVATE_ROW_LABEL = 'private contribution'

/**
 * @description Renders the file column for a contribution the file history
 * cannot place: a fabricated path behind a blur, so the log reads as work
 * happening under redaction rather than as a column of apologies.
 * @param path The fabricated path, from `privatePath`.
 * @returns The redacted column and the text that stands in for it.
 *
 * The path is out of the accessibility tree because it is a fabrication, not
 * because it is sensitive. Reading a plausible filename aloud would mislead
 * exactly the viewer with no way to tell it is scenery; the blur is the only
 * thing telling a sighted viewer, and a listener never receives it.
 *
 * Not a link, and never one: this names no file to point at, and the repo it
 * belongs to is called `private`, so github.com/private would be a stranger's
 * page.
 */
export function PrivateFile({ path }: { readonly path: string }): ReactNode {
  return (
    <>
      <span aria-hidden="true" className="file redact">
        {path}
      </span>
      <span className="sr-only">{PRIVATE_ROW_LABEL}</span>
    </>
  )
}
