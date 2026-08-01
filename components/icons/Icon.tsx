import type { SVGProps } from 'react'
import { ICON_PATHS, type IconName } from './paths'

/**
 * Props for an icon whose accessible name belongs to its surrounding control.
 */
export type IconProps = Omit<
  SVGProps<SVGSVGElement>,
  | 'children'
  | 'viewBox'
  | 'aria-hidden'
  | 'aria-label'
  | 'aria-labelledby'
  | 'role'
> & {
  name: IconName
  /** Rendered edge length in CSS px. Default 16. */
  size?: number
}

/** Render a named, decorative control icon. */
export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      {...rest}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  )
}

export type NamedIconProps = Omit<IconProps, 'name'>

export const PauseIcon = (props: NamedIconProps) => (
  <Icon name="pause" {...props} />
)
export const PlayIcon = (props: NamedIconProps) => (
  <Icon name="play" {...props} />
)
export const SkipStartIcon = (props: NamedIconProps) => (
  <Icon name="skipStart" {...props} />
)
export const SkipEndIcon = (props: NamedIconProps) => (
  <Icon name="skipEnd" {...props} />
)
export const MenuIcon = (props: NamedIconProps) => (
  <Icon name="menu" {...props} />
)
export const MailIcon = (props: NamedIconProps) => (
  <Icon name="mail" {...props} />
)
export const SpinnerIcon = (props: NamedIconProps) => (
  <Icon name="spinner" {...props} />
)
export const CommitIcon = (props: NamedIconProps) => (
  <Icon name="commit" {...props} />
)
export const StarIcon = (props: NamedIconProps) => (
  <Icon name="star" {...props} />
)
