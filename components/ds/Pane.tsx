import type { CSSProperties, ElementType, ReactNode, Ref } from 'react'
import { PaneBar } from './PaneBar'

export interface PaneProps {
  title?: ReactNode
  titleId?: string
  titleAs?: 'span' | 'h2' | 'h3'
  dots?: boolean
  titleColor?: string
  right?: ReactNode
  focus?: boolean
  bleed?: boolean
  footer?: ReactNode
  as?: 'div' | 'section' | 'article' | 'aside'
  labelledBy?: string
  bodyRef?: Ref<HTMLDivElement>
  id?: string
  /** `-1` when the pane is a fragment target and must take focus on arrival. */
  tabIndex?: number
  className?: string
  style?: CSSProperties
  bodyStyle?: CSSProperties
  bodyClassName?: string
  children?: ReactNode
}

/**
 * Renders a bordered terminal pane with optional title chrome and footer slot.
 *
 * @param props - Pane structure and presentation options.
 * @returns The pane landmark and its body.
 */
export function Pane({
  as = 'div',
  title,
  titleId,
  titleAs = 'span',
  dots = false,
  titleColor,
  right,
  focus = false,
  bleed = false,
  footer,
  labelledBy,
  bodyRef,
  id,
  tabIndex,
  className,
  style,
  bodyStyle,
  bodyClassName,
  children,
}: PaneProps): ReactNode {
  const Tag: ElementType = as
  const hasBar = title != null || dots || right != null
  const paneClassName = ['pane', focus && 'focus', className]
    .filter(Boolean)
    .join(' ')
  const paneBodyClassName = ['pane-body', bleed && 'bleed', bodyClassName]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      aria-labelledby={labelledBy}
      className={paneClassName}
      id={id}
      style={style}
      tabIndex={tabIndex}
    >
      {hasBar ? (
        <PaneBar
          dots={dots}
          right={right}
          title={title}
          titleAs={titleAs}
          titleColor={titleColor}
          titleId={titleId}
        />
      ) : null}
      <div className={paneBodyClassName} ref={bodyRef} style={bodyStyle}>
        {children}
      </div>
      {footer}
    </Tag>
  )
}
