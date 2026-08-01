/**
 * SVG path data authored against a 24x24 viewBox, fill-rule "evenodd".
 * Every entry is safe to pass to `new Path2D(d)` and to `ctx.fill(path)`.
 */
export const ICON_PATHS = {
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  play: 'M8 5l12 7-12 7z',
  skipStart: 'M5 5h3v14H5zM20 5l-11 7 11 7z',
  skipEnd: 'M4 5l11 7-11 7zM16 5h3v14h-3z',
  menu: 'M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z',
  mail: 'M2 5h20v14H2ZM4 7h16v10H4ZM5.4 7.6 12 12.5l6.6-4.9v2.4L12 15 5.4 10.1Z',
  spinner:
    'M10 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  commit:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  star: 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5-4.7-4.6 6.5-.9z',
} as const

export type IconName = keyof typeof ICON_PATHS
