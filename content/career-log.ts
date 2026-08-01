export type LogHue =
  'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'fg4'

export interface CareerCommit {
  readonly hash: string
  readonly ref: string | null
  readonly years: string
  readonly title: string
  readonly detail: string
  readonly stack: readonly string[]
  readonly hue: LogHue
  readonly lane: 'main' | 'role' | 'side' | 'education'
  readonly root: boolean
  readonly body: readonly string[]
  readonly preWeb3: boolean
}

// Hashes are sha1(`${org}:${startMonth}`).slice(0, 7), checked against the source entities.
export const CAREER_LOG = [
  {
    hash: 'ee787a7',
    ref: '(HEAD -> optimism, tag: role/optimism)',
    years: '2025–26',
    title: 'Optimism · Actions SDK',
    detail:
      'technical architect — embedded wallets to DeFi protocols; allow and block listing, configuration for assets, markets, chains and infra providers',
    stack: ['typescript', 'hono', 'vite', 'react', 'solidity', 'kubernetes'],
    hue: 'aqua',
    lane: 'role',
    root: false,
    body: [
      'OP Labs. May 2025 - present. Remote, America/Los_Angeles.',
      '',
      'Took "embedded wallets should be able to use DeFi" from a doc to an interface: one call per action, protocol adapters behind it, policy at the edge.',
      '',
      'actions.optimism.io',
    ],
    preWeb3: false,
  },
  {
    hash: 'b85c3e3',
    ref: '(tag: agent/its-applekid)',
    years: '2026',
    title: 'its-applekid initialized',
    detail:
      'second actor on the graph — a separate agent identity with its own commits',
    stack: [],
    hue: 'purple',
    lane: 'side',
    root: false,
    body: [
      'Initialized Jan 2026.',
      '',
      'A second actor writes with its own GitHub identity and its own commits. Per-commit attribution is exact; the lane is supplied by public repository discovery.',
      '',
    ],
    preWeb3: false,
  },
  {
    hash: '538d21c',
    ref: null,
    years: '2022–25',
    title: 'Metropolis · lead engineer',
    detail:
      'smart-contract developer tooling — arbitrary transaction and contract deployment, tokenization, wallet infrastructure and multi-signature operations',
    stack: [
      'typescript',
      'express',
      'next',
      'react',
      'solidity',
      'redis',
      'mongodb',
      'graphql',
    ],
    hue: 'aqua',
    lane: 'role',
    root: false,
    body: [
      'Metropolis (0xmetropolis). Sep 2022 - Apr 2025.',
      '',
      'Built developer tooling for teams who ship products, not papers.',
      '',
    ],
    preWeb3: false,
  },
  {
    hash: '3437755',
    ref: null,
    years: '2021–22',
    title: 'ConsenSys · Truffle',
    detail:
      'open-source developer tools — Truffle core, L2 bridging and EVM debugging; managed outside contributions and led education',
    stack: ['typescript', 'solidity'],
    hue: 'blue',
    lane: 'role',
    root: false,
    body: [
      'ConsenSys. Sep 2021 - Sep 2022.',
      '',
      'Truffle and its boxes are now archived. The L2 bridge work was the largest body of work at ConsenSys in 2022.',
      '',
    ],
    preWeb3: false,
  },
  {
    hash: '3cc4bc6',
    ref: null,
    years: '2017–21',
    title: 'Stitch Fix · tech lead',
    detail: 'customer-facing features and organization-wide microservice APIs',
    stack: ['ruby', 'rails', 'react', 'typescript', 'postgresql', 'graphql'],
    hue: 'orange',
    lane: 'role',
    root: false,
    body: [
      'Stitch Fix. Dec 2017 - Sep 2021.',
      '',
      'Scoped, designed, rolled out, and supported customer-facing features.',
      '',
    ],
    preWeb3: true,
  },
  {
    hash: '79c6a5b',
    ref: null,
    years: '2014–17',
    title: 'EMS Heroes · co-founder',
    detail:
      'medical records and billing software for emergency medical services',
    stack: ['ruby', 'rails', 'javascript'],
    hue: 'yellow',
    lane: 'role',
    root: false,
    body: [
      'EMS Heroes. Mar 2014 - Dec 2017.',
      '',
      'Co-founded it, wrote it, and supported it.',
      '',
    ],
    preWeb3: true,
  },
  {
    hash: '4dc06be',
    ref: null,
    years: '2010–14',
    title: 'Omni Developers · founder',
    detail:
      'software consulting firm — CMS, ecommerce and healthcare web applications',
    stack: ['php', 'javascript'],
    hue: 'green',
    lane: 'role',
    root: false,
    body: [
      'Omni Developers. Feb 2010 - Mar 2014.',
      '',
      'Started during sophomore year; see the parallel lane.',
      '',
    ],
    preWeb3: true,
  },
  {
    hash: '9ee7ca6',
    ref: '(tag: rowan/bs)',
    years: '2008–12',
    title: 'Rowan University',
    detail: 'B.S. Management Information Systems, minor in Computer Science',
    stack: [],
    hue: 'fg4',
    lane: 'education',
    root: true,
    body: [
      'Rowan University. Sep 2008 - May 2012.',
      '',
      'The education lane overlaps the Omni branch; the merge was not clean and that was the point.',
      '',
    ],
    preWeb3: true,
  },
] as const satisfies readonly CareerCommit[]

export const CAREER_LOG_PANE_TITLE = 'git log --graph --decorate --all'
export const CAREER_LOG_HEAD = 'HEAD -> optimism'
