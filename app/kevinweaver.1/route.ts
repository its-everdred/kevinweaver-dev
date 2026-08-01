import { fill } from '@/content/boot'
import { MAN_FOOTER, MAN_HEADER, MAN_PAGE } from '@/content/manpage'

export const dynamic = 'force-static'

const REVISION_DATE = new Date().toISOString().slice(0, 10)
const roffText = (text: string): string => text.replace(/\\/g, '\\e')
const roffLine = (text: string): string => {
  const escaped = roffText(text)
  return /^[.']/.test(escaped) ? `\\&${escaped}` : escaped
}
const roffTerm = (term: string): string =>
  roffText(term).replace(/(^|\s)-/g, '$1\\-')
const quoted = (value: string): string => `"${value.replace(/"/g, '\\(dq')}"`

export function GET(): Response {
  const date = fill(MAN_FOOTER.center, { date: REVISION_DATE })
  const out: string[] = [
    `.TH KEVINWEAVER 1 ${quoted(date)} ${quoted(MAN_FOOTER.left)} ${quoted(MAN_HEADER.center)}`,
  ]

  for (const section of MAN_PAGE) {
    out.push(`.SH ${quoted(section.id)}`)
    for (const block of section.blocks) {
      out.push(block.term === null ? '.PP' : '.TP')
      if (block.term !== null) out.push(roffTerm(block.term))
      if (block.literal) out.push('.nf')
      for (const line of block.lines) {
        if (line.trim() !== '') out.push(roffLine(line))
      }
      if (block.literal) out.push('.fi')
    }
  }

  return new Response(out.join('\n') + '\n', {
    headers: { 'content-type': 'text/troff; charset=utf-8' },
  })
}
