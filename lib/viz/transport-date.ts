const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

/** Formats an ISO date for the transport's compact display. */
export function formatTransportDate(iso: string): string {
  const parts = iso.split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year === undefined || month === undefined || day === undefined) return ''
  return `${day} ${MONTH_NAMES[month - 1] ?? ''} ${year}`
}
