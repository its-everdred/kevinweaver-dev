import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export interface MeterProps {
  label: ReactNode
  value: number
  display?: ReactNode
  rainbow?: boolean
  from?: string
  to?: string
  className?: string
}

interface MeterStyle extends CSSProperties {
  '--val': string
  '--g1'?: string
  '--g2'?: string
}

/**
 * Renders a labelled, accessible progress meter using design-system variables.
 *
 * @param props - Meter label, value, and optional gradient configuration.
 * @returns A metric row with a clamped progress indicator.
 */
export function Meter({
  label,
  value,
  display,
  rainbow = false,
  from,
  to,
  className,
}: MeterProps): ReactNode {
  const labelId = useId()
  const clampedValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0
  const meterStyle: MeterStyle = {
    '--val': `${clampedValue}%`,
    ...(from ? { '--g1': from } : {}),
    ...(to ? { '--g2': to } : {}),
  }
  const metricClassName = ['metric', rainbow && 'rainbowfill', className]
    .filter(Boolean)
    .join(' ')
  const progressDisplay = display ?? `${clampedValue}%`
  const accessibleValueText =
    typeof progressDisplay === 'string' || typeof progressDisplay === 'number'
      ? String(progressDisplay)
      : undefined

  return (
    <div className={metricClassName}>
      <div className="m-row">
        <span id={labelId}>{label}</span>
        <span className="m-pct">{progressDisplay}</span>
      </div>
      <div
        aria-labelledby={labelId}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={clampedValue}
        aria-valuetext={accessibleValueText}
        className="meter"
        role="progressbar"
        style={meterStyle}
      >
        <div className="fill" />
      </div>
    </div>
  )
}
