import type { CSSProperties } from 'react'

/** The seven top-level regions that the page mounts in document order. */
export type RegionSlot =
  | 'header'
  | 'instrument'
  | 'manPage'
  | 'careerLog'
  | 'contact'
  | 'tmuxBar'
  | 'bootOverlay'

/**
 * The optional envelope shared by every region.
 *
 * Regions read their own data and own their own layout, keeping page composition
 * independent from their implementation.
 */
export interface RegionCommonProps {
  /** Fragment target for the header navigation. */
  id?: string
  /** Appended to a region's own class list. */
  className?: string
  /** Layout escape hatch for the page shell. */
  style?: CSSProperties
}

export interface HeaderProps extends RegionCommonProps {
  id?: string
}

export interface InstrumentProps extends RegionCommonProps {
  id?: string
}

export interface ManPageProps extends RegionCommonProps {
  id?: string
}

export interface CareerLogProps extends RegionCommonProps {
  id?: string
}

export interface ContactProps extends RegionCommonProps {
  id?: string
}

export interface TmuxBarProps extends RegionCommonProps {
  id?: string
}

export interface BootOverlayProps extends RegionCommonProps {
  id?: string
}

export interface TransportBarProps extends RegionCommonProps {
  id?: string
}

/** Metadata that fixes each region's landmark and heading contract. */
export interface RegionMeta {
  /** Landmark element the region renders as its outermost node. */
  readonly landmark: 'header' | 'section' | 'footer' | 'div'
  /** Fragment id, or null for regions outside header navigation. */
  readonly anchorId: string | null
  /** Id of the element carrying the region's accessible name. */
  readonly titleId: string
  /** Region-level accessible name. Nested panes carry their own titles. */
  readonly accessibleName: string
  /** Heading level reserved for the region title. */
  readonly headingLevel: 2
}

export const REGION_META = {
  header: {
    landmark: 'header',
    anchorId: null,
    titleId: 'region-header-title',
    accessibleName: 'site header',
    headingLevel: 2,
  },
  instrument: {
    landmark: 'section',
    anchorId: null,
    titleId: 'region-instrument-title',
    accessibleName: 'contribution instrument',
    headingLevel: 2,
  },
  manPage: {
    landmark: 'section',
    anchorId: 'whoami',
    titleId: 'region-man-page-title',
    accessibleName: 'man kevin-weaver',
    headingLevel: 2,
  },
  careerLog: {
    landmark: 'section',
    anchorId: 'arc',
    titleId: 'region-career-log-title',
    accessibleName: 'git log --graph --oneline --since=2021',
    headingLevel: 2,
  },
  contact: {
    landmark: 'section',
    anchorId: 'contact',
    titleId: 'region-contact-title',
    accessibleName: 'reach me',
    headingLevel: 2,
  },
  tmuxBar: {
    landmark: 'footer',
    anchorId: null,
    titleId: 'region-tmux-bar-title',
    accessibleName: 'status bar',
    headingLevel: 2,
  },
  bootOverlay: {
    landmark: 'div',
    anchorId: null,
    titleId: 'region-boot-overlay-title',
    accessibleName: 'kevinweaver.dev — cold start',
    headingLevel: 2,
  },
} as const satisfies Record<RegionSlot, RegionMeta>

export interface NavSection {
  readonly index: number
  readonly id: string
  readonly label: string
}

/** Header navigation sections, rendered as tmux window numbers. */
export const NAV_SECTIONS = [
  { index: 1, id: 'whoami', label: 'whoami' },
  { index: 2, id: 'arc', label: 'arc' },
  { index: 3, id: 'contact', label: 'contact' },
] as const satisfies readonly NavSection[]
