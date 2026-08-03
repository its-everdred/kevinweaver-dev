/** Produces a canonical refs snapshot without changing extracted values. */
export function sortedHeads(
  heads: Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(heads).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  )
}
