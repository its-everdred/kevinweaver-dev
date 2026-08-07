import { fill } from './boot'

export type ManSectionId = 'NAME' | 'DESCRIPTION' | 'OPTIONS' | 'AUTHOR'

export interface ManBlock {
  readonly term: string | null
  readonly lines: readonly string[]
  readonly indent: 7 | 14
  readonly literal: boolean
}

export interface ManSection {
  readonly id: ManSectionId
  readonly blocks: readonly ManBlock[]
  readonly abridged: boolean
}

const paragraph = (lines: readonly string[]): ManBlock => ({
  term: null,
  lines,
  indent: 7,
  literal: false,
})
const term = (name: string, lines: readonly string[]): ManBlock => ({
  term: name,
  lines,
  indent: 14,
  literal: false,
})

export const MAN_PAGE = [
  {
    id: 'NAME',
    abridged: true,
    blocks: [
      paragraph([
        'kevinweaver - fullstack software engineer; builds and ships product-grade',
        'systems across web, API, and onchain surfaces',
      ]),
    ],
  },
  {
    id: 'DESCRIPTION',
    abridged: true,
    blocks: [
      paragraph([
        'kevinweaver is a senior fullstack software engineer. Shipped customer-facing',
        'features and platform APIs used by millions of users; designed and built',
        'smart-contract tooling, wallet infrastructure, and developer SDKs.',
        '',
        'Employed since February 2010. Currently a Senior Full Stack Software Engineer',
        'at Optimism, working on the Actions SDK (actions.optimism.io).',
      ]),
    ],
  },
  {
    id: 'OPTIONS',
    abridged: false,
    blocks: [
      term('--lang=LIST', [
        'Comma-separated languages and frameworks to match. Recognized values:',
        'typescript, solidity, hono, vite, react, express, next, ruby, rails,',
        'php, javascript, postgresql, redis, mongodb, graphql, kubernetes.',
      ]),
    ],
  },
  {
    id: 'AUTHOR',
    abridged: false,
    blocks: [paragraph(['Kevin Weaver.'])],
  },
] as const satisfies readonly ManSection[]

export const MAN_WRAP_COLUMNS = 78
export const MAN_HEADER = {
  left: 'KEVINWEAVER(1)',
  center: 'General Commands Manual',
  right: 'KEVINWEAVER(1)',
} as const
export const MAN_FOOTER = {
  left: 'KEVINWEAVER(1)',
  center: '{date}',
  right: 'KEVINWEAVER(1)',
} as const
export const MAN_ABRIDGED_HINT = '[ press m for full page ]'

export { fill }
