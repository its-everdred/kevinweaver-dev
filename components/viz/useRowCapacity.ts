'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/** Gap kept between `.kw-events .rows` children. */
const ROW_GAP_PX = 2
/** The minimum a row takes, which is the file link's 24x24 pointer target. */
const ROW_HEIGHT_PX = 24
/** Height one more row costs the pane. */
const ROW_STRIDE_PX = ROW_HEIGHT_PX + ROW_GAP_PX
/**
 * Rows assumed until the pane reports a height: the server render, a browser
 * without `ResizeObserver`, and jsdom, which runs no layout at all. Roughly
 * what the side column holds at the desktop breakpoint.
 */
const DEFAULT_VISIBLE_ROWS = 12
/** Below this the pane is a strip, and a window shorter than it reads as noise. */
const MIN_VISIBLE_ROWS = 4
/**
 * A ceiling on the mounted row count. The pane's height comes from flex layout
 * and never from its own content, so a measurement cannot feed back into the
 * count that produced it; the clamp is what bounds the damage if some future
 * container ever lets it try.
 */
const MAX_VISIBLE_ROWS = 40

/**
 * @description Reports how many rows a pane can show, so a log mounts the rows
 * a viewer can see and no more. Measured rather than assumed: the side column
 * is half the galaxy's height on a desktop and a fixed strip below each of two
 * breakpoints, so any single number would leave dead space on one of them.
 * @param ref The clipped row container to measure.
 * @returns Rows that fit, clamped, or a default while nothing has been measured.
 */
export function useRowCapacity(ref: RefObject<HTMLElement | null>): number {
  const [rows, setRows] = useState(DEFAULT_VISIBLE_ROWS)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setRows(rowsForHeight(node.clientHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return rows
}

/**
 * @description Converts a measured pane height into a row count.
 * @param heightPx The pane's content box height.
 * @returns Rows that fit, or the default when nothing has been laid out.
 */
function rowsForHeight(heightPx: number): number {
  if (heightPx <= 0) return DEFAULT_VISIBLE_ROWS
  // n rows occupy n strides less the gap the last of them does not need.
  const fits = Math.floor((heightPx + ROW_GAP_PX) / ROW_STRIDE_PX)
  return Math.min(MAX_VISIBLE_ROWS, Math.max(MIN_VISIBLE_ROWS, fits))
}
