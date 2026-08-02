import { fill } from '@/content/boot'
import { CAREER_LOG, CAREER_LOG_PANE_TITLE } from '@/content/career-log'
import { IDENTITY } from '@/content/identity'
import { MAN_FOOTER, MAN_HEADER, MAN_PAGE } from '@/content/manpage'

export const dynamic = 'force-static'

const COLUMNS = 80
const REVISION_DATE = new Date().toISOString().slice(0, 10)

function chrome(
  triple: { left: string; center: string; right: string },
  center: string
): string {
  const slack =
    COLUMNS - triple.left.length - center.length - triple.right.length
  const leftPad = Math.max(1, Math.floor(slack / 2))
  const rightPad = Math.max(1, slack - leftPad)
  return (
    triple.left +
    ' '.repeat(leftPad) +
    center +
    ' '.repeat(rightPad) +
    triple.right
  )
}

type ManBlock = (typeof MAN_PAGE)[number]['blocks'][number]

function wrapLine(line: string, prefix: string): string[] {
  const width = COLUMNS - prefix.length
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`
    if (current !== '' && next.length > width) {
      lines.push(prefix + current)
      current = word
    } else {
      current = next
    }
  }
  lines.push(prefix + current)
  return lines
}

function blockLines(block: ManBlock): string[] {
  const pad = ' '.repeat(block.indent)
  const body = block.lines.flatMap((line) =>
    line === '' ? [''] : wrapLine(line, pad)
  )
  return block.term === null
    ? [...body, '']
    : ['       ' + block.term, ...body, '']
}

function manPageLines(): string[] {
  const out: string[] = [chrome(MAN_HEADER, MAN_HEADER.center), '']
  for (const section of MAN_PAGE) {
    out.push(section.id, ...section.blocks.flatMap(blockLines))
  }
  out.push(chrome(MAN_FOOTER, fill(MAN_FOOTER.center, { date: REVISION_DATE })))
  return out
}

function careerLogLines(): string[] {
  const out: string[] = [`$ ${CAREER_LOG_PANE_TITLE}`, '']
  for (const commit of CAREER_LOG) {
    const rail = commit.root ? ' ' : '|'
    out.push(
      `* commit ${commit.hash}${commit.ref === null ? '' : ` ${commit.ref}`}`
    )
    out.push(`${rail} Date:   ${commit.years}`, rail)
    out.push(...wrapLine(commit.title, `${rail}     `))
    out.push(...wrapLine(commit.detail, `${rail}     `), rail)
    for (const line of commit.body) {
      out.push(...(line === '' ? [rail] : wrapLine(line, `${rail}     `)))
    }
    if (commit.stack.length > 0) {
      out.push(rail, ...wrapLine(commit.stack.join(' · '), `${rail}     `))
    }
    out.push(commit.root ? '' : rail)
  }
  return out
}

export function GET(): Response {
  const body = [
    ...manPageLines(),
    '',
    ...careerLogLines(),
    '',
    '$ whoami',
    IDENTITY.whoami,
    '',
    '$ finger -l',
    ...IDENTITY.finger.map((field) => `${field.label}: ${field.value}`),
    '',
    ...IDENTITY.project,
    ...IDENTITY.plan,
    '',
    'REACH ME',
    ...IDENTITY.links.map((link) =>
      link.note === null
        ? `  ${link.label}  ${link.href}`
        : `  ${link.label}  ${link.href}  (${link.note})`
    ),
    '',
    'STATUS',
    ...IDENTITY.status.map((line) => `  ${line}`),
    '',
    ...IDENTITY.curlLines,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
