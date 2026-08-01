import { fill } from './boot'

export type ManSectionId =
  | 'NAME'
  | 'SYNOPSIS'
  | 'DESCRIPTION'
  | 'OPTIONS'
  | 'ENVIRONMENT'
  | 'FILES'
  | 'EXAMPLES'
  | 'DIAGNOSTICS'
  | 'SEE ALSO'
  | 'AUTHOR'
  | 'REPORTING BUGS'
  | 'BUGS'

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
const transcript = (lines: readonly string[]): ManBlock => ({
  term: null,
  lines,
  indent: 14,
  literal: true,
})

export const MAN_PAGE = [
  {
    id: 'NAME',
    abridged: true,
    blocks: [
      paragraph([
        'kevinweaver - lead fullstack software engineer; turns ambiguous problems',
        'into shipped, documented, onchain-adjacent systems',
      ]),
    ],
  },
  {
    id: 'SYNOPSIS',
    abridged: true,
    blocks: [
      paragraph([
        'kevinweaver [-v...] [--remote] [--stack=LIST] [--chain=NETWORK]',
        '           [-j JOBS] [--ship] [--] PROBLEM...',
        '',
        'kevinweaver --hire [--full-time | --contract | --advise]',
        '',
        'kevinweaver --hackathon [--weekend] [--win]',
      ]),
    ],
  },
  {
    id: 'DESCRIPTION',
    abridged: true,
    blocks: [
      paragraph([
        'kevinweaver reads one or more PROBLEM operands from an ambiguous source,',
        'decomposes them into contracts, services, and interfaces, and writes',
        'production systems to standard output. Tests and documentation are emitted',
        'on the same pass; they are not a separate target.',
        '',
        'Passionate web3 builder, Ethereum enthusiast, and public goods enjoyer',
        "designing human coordination tools on the internet's frontier.",
        '',
        'In continuous operation since February 2010 across six employers, two of',
        "which were his own, and every major version of JavaScript's identity crisis.",
        'Currently deployed as technical architect of the Actions SDK',
        '(actions.optimism.io). Prior deployments are recorded in git-log(1); see the',
        'arc pane, or run:',
      ]),
      transcript(['$ curl -sL kevinweaver.dev/resume.txt']),
      paragraph([
        'kevinweaver is fullstack in the literal sense: it terminates at the',
        'Postgres row on one end and the pixel on the other, and has been paged for',
        'both.',
      ]),
    ],
  },
  {
    id: 'OPTIONS',
    abridged: false,
    blocks: [
      term('-j JOBS, --jobs=JOBS', [
        'Run up to JOBS problems in parallel. JOBS defaults to the number of',
        'available afternoons. Values above the practical limit degrade to',
        'round-robin context switching and a longer standup.',
      ]),
      term('--teach', [
        'Technical educator. Emits the same idea at several levels of detail',
        'until one of them lands. Led a cross-organization educational effort at',
        'ConsenSys and wrote the docs people actually paste into Discord.',
      ]),
      term('--hackathon', [
        'Hackathon connoisseur. Award-winning across nearly a dozen events:',
        'rapid end-to-end Web3 and full-stack applications spanning DeFi, NFTs,',
        'governance, analytics dashboards, and social and creator tooling.',
      ]),
      term('--stack=LIST', [
        'Comma-separated. Recognized values: typescript, solidity, ruby, rails,',
        'react, next, node, express, hono, vite, elixir, rust, graphql, postgresql,',
        'mongodb, redis, k8s. Unrecognized values are not an error; they are a',
        'weekend.',
      ]),
      term('--chain=NETWORK', [
        'Target an EVM network. Defaults to $KW_CHAIN. Passing --chain=mainnet',
        'during a gas spike is permitted, not advised.',
      ]),
      term('--remote', [
        'Default since 2020. Timezone is America/Los_Angeles. Overlap with UTC+1',
        'is negotiable and has historically been survived.',
      ]),
      term('--ship', ['Deploy. Ignores --perfect. There is no --perfect.']),
      term('-v, --verbose', [
        'Increase explanation. May be repeated. More verbosity produces a diagram,',
        'an ADR, and a follow-up thread nobody asked for.',
      ]),
      term('--force', [
        'Merge without review. Retained for compatibility with early-stage',
        'startups. Behavior is undefined and has been.',
      ]),
    ],
  },
  {
    id: 'ENVIRONMENT',
    abridged: false,
    blocks: [
      term('KW_ACTOR', [
        'Which identity is committing. One of its-everdred (human, since',
        '2011-09-01) or its-applekid (agent, initialized 2026-01-29). Both write',
        'to the same contribution graph and are counted separately in the tooltip.',
      ]),
      term('KW_CHAIN', ['Preferred settlement layer. Default: optimism.']),
      term('KW_TZ', [
        'America/Los_Angeles. Set in December 2017 and never unset.',
      ]),
      term('KW_COFFEE', [
        'Required. If unset, kevinweaver falls back to a degraded mode with',
        'identical syntax and worse opinions.',
      ]),
      term('NO_COLOR', ['Honored everywhere except the pixel art.']),
    ],
  },
  {
    id: 'FILES',
    abridged: false,
    blocks: [
      term('/usr/share/doc/kevinweaver/rowan-university.bs', [
        'B.S. Management Information Systems, minor in Computer Science.',
        'Rowan University, September 2008 - May 2012. Overlaps the first two',
        'years of /var/log/kevinweaver/career.log; see the graph.',
      ]),
      term('/var/log/kevinweaver/career.log', [
        'Append-only, never rotated. Read with git-log(1); rendered in the arc pane.',
      ]),
      term('~/.config/kevinweaver/opinions.toml', [
        'Strongly held, loosely coupled. Reloaded on new evidence without a restart.',
      ]),
      term('~/dotfiles', [
        'github.com/its-everdred/dotfiles. Do not edit ~/.zshrc by hand; it is',
        'a symlink and will be overwritten.',
      ]),
      term('/dev/coffee', ['Character device. Blocking.']),
    ],
  },
  {
    id: 'EXAMPLES',
    abridged: false,
    blocks: [
      paragraph([
        'Connect an embedded wallet to a DeFi protocol without shipping that',
        "protocol's footguns to end users:",
      ]),
      transcript([
        '$ kevinweaver --chain=optimism --stack=typescript,solidity \\',
        '      "let embedded wallets use lending markets"',
        '-> actions.optimism.io',
      ]),
      paragraph([
        'Turn a smart contract into something a product team can deploy on a',
        'Tuesday:',
      ]),
      transcript([
        '$ kevinweaver --stack=solidity,typescript --ship \\',
        '      "arbitrary tx and contract deployment engine"',
      ]),
      paragraph([
        'Keep an open source developer tool usable while its ecosystem moves to',
        'L2:',
      ]),
      transcript([
        '$ kevinweaver --teach "truffle, boxes, bridging, evm debugging"',
      ]),
      paragraph(['Read this page the way it was written:']),
      transcript(['$ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -']),
    ],
  },
  {
    id: 'DIAGNOSTICS',
    abridged: false,
    blocks: [
      paragraph([
        'Exit status is 0 on ship.',
        '',
        'Scope changed after the estimate. Not a bug.',
        'Blocked on review. Escalated politely, then loudly.',
        'Answer found; the question was wrong. Rerun with -v.',
        'OOM-killed by quarterly planning.',
      ]),
    ],
  },
  {
    id: 'SEE ALSO',
    abridged: false,
    blocks: [
      paragraph([
        'git-log(1), whoami(1), finger(1), curl(1), forge(1), solc(1), tsc(1),',
        'kubectl(1), ethereum(7), public-goods(7)',
        '',
        'typescript - solidity - react - next - node - express - hono - vite -',
        'ruby - rails - elixir - rust - graphql - postgresql - mongodb -',
        'kubernetes - foundry - subgraphs - ci/cd',
      ]),
    ],
  },
  {
    id: 'AUTHOR',
    abridged: false,
    blocks: [paragraph(['Written by Kevin Weaver. California, USA.'])],
  },
  {
    id: 'REPORTING BUGS',
    abridged: false,
    blocks: [
      paragraph([
        'Report bugs, offers, and strong disagreements through the contact pane',
        'at kevinweaver.dev, or open an issue against github.com/its-everdred.',
        'Pull requests are read. Drive-by refactors are read twice.',
      ]),
    ],
  },
  {
    id: 'BUGS',
    abridged: false,
    blocks: [
      paragraph([
        'Will explain the entire system when asked a yes-or-no question.',
        '',
        'Cannot leave a TODO in the tree overnight. Documented as a feature, behaves',
        'as a bug.',
        '',
        'Estimates are accurate in relative units and wrong in absolute ones.',
        'Multiply by pi and round up.',
        '',
        'Refuses to ship a UI with a loading spinner and no empty state. WONTFIX.',
        '',
        'Reads the changelog. All of it.',
        '',
        'Since 2026-01-29 a second process (its-applekid) writes to the same',
        'repositories. Per-commit attribution is exact; attribution in conversation is',
        'worse. Prefer git-blame(1).',
      ]),
    ],
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
