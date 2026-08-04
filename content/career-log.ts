export type LogHue =
  | 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'fg4'

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
    ref: null,
    years: '2025–26',
    title: 'Optimism · Senior Full Stack Software Engineer',
    detail:
      'technical architect for the Actions SDK (actions.optimism.io): connects embedded wallets to DeFi protocols. Supports allow/block listing, configuration for assets, markets, chains, and other infra providers',
    stack: ['TypeScript', 'Hono', 'Vite', 'React', 'Solidity', 'Kubernetes'],
    hue: 'aqua',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: false,
  },
  {
    hash: '538d21c',
    ref: null,
    years: '2022–25',
    title: 'Metropolis · Lead Software Engineer',
    detail:
      'shipped various smart contract dev tools including: arbitrary tx + contract deployment engine, tokenization + wallet infra, multi-sig module and more',
    stack: [
      'TypeScript',
      'Express',
      'Next.js',
      'React',
      'Solidity',
      'Redis',
      'MongoDB',
      'GraphQL',
    ],
    hue: 'aqua',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: false,
  },
  {
    hash: '3437755',
    ref: null,
    years: '2021–22',
    title: 'ConsenSys · Lead Blockchain Engineer',
    detail:
      'built open source smart contract dev tools: Truffle, L2 bridging, EVM debugging. Managed OS contributions, led cross-org educational effort',
    stack: ['TypeScript', 'Solidity'],
    hue: 'blue',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: false,
  },
  {
    hash: '3cc4bc6',
    ref: null,
    years: '2017–21',
    title: 'Stitch Fix · Lead Software Engineer',
    detail:
      'tech lead shipped customer facing features earning $millions in revenue, serving millions of users. Designed microservice APIs utilized across the org',
    stack: ['Ruby', 'Rails', 'React', 'TypeScript', 'PostgreSQL', 'GraphQL'],
    hue: 'orange',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: true,
  },
  {
    hash: '79c6a5b',
    ref: null,
    years: '2014–17',
    title: 'EMS Heroes · Fullstack Engineer',
    detail:
      'co-founded a medical records and billing software company. Wrote and shipped the product',
    stack: ['Ruby', 'Rails', 'JavaScript'],
    hue: 'yellow',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: true,
  },
  {
    hash: '4dc06be',
    ref: null,
    years: '2010–14',
    title: 'Omni Developers · Fullstack Engineer',
    detail:
      'founded a software consulting firm. Built CMS, eCommerce, and healthcare web applications',
    stack: ['PHP', 'JavaScript'],
    hue: 'green',
    lane: 'role',
    root: false,
    body: [],
    preWeb3: true,
  },
] as const satisfies readonly CareerCommit[]

export const CAREER_LOG_PANE_TITLE = 'git log --graph --decorate --all'
export const CAREER_LOG_HEAD = 'HEAD -> optimism'
