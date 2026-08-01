import type { CSSProperties, ReactNode } from 'react'

export interface PaneBarProps {
  title?: ReactNode
  titleId?: string
  titleAs?: 'span' | 'h2' | 'h3'
  dots?: boolean
  titleColor?: string
  right?: ReactNode
}

/** Renders the optional chrome bar shared by design-system panes. */
export function PaneBar({
  title,
  titleId,
  titleAs: Title = 'span',
  dots = false,
  titleColor,
  right,
}: PaneBarProps): ReactNode {
  const titleStyle: CSSProperties | undefined = titleColor
    ? { color: titleColor }
    : undefined

  return (
    <div className="pane-bar">
      {dots ? (
        <div aria-hidden="true" className="dots">
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {title != null ? (
        <Title className="pane-title" id={titleId} style={titleStyle}>
          {title}
        </Title>
      ) : null}
      {right != null ? (
        <>
          <span style={{ flex: 1 }} />
          {right}
        </>
      ) : null}
    </div>
  )
}
