export type EntityKind = 'role' | 'founder' | 'education'

export interface Employer {
  readonly key:
    | 'optimism'
    | 'metropolis'
    | 'consensys'
    | 'stitch-fix'
    | 'ems-heroes'
    | 'omni'
    | 'rowan'
  readonly org: string
  readonly orgQualified: string | null
  readonly kind: EntityKind
  readonly title: string
  readonly start: string
  readonly end: string | null
  readonly location: string
  readonly stack: readonly string[]
  readonly achievements: readonly string[]
  readonly evidence: readonly {
    readonly label: string
    readonly href: string
  }[]
}

export const EMPLOYERS = [
  {
    key: 'optimism',
    org: 'Optimism',
    orgQualified: null,
    kind: 'role',
    title: 'Senior Full Stack Software Engineer',
    start: '2025-05',
    end: null,
    location: 'Remote, America/Los_Angeles',
    stack: ['TypeScript', 'Hono', 'Vite', 'React', 'Solidity', 'Kubernetes'],
    achievements: [
      'Built the Actions SDK surface for embedded wallets and DeFi protocols.',
      'Added allow and block listing with configuration for assets, markets, chains, and infrastructure providers.',
    ],
    evidence: [
      { label: 'actions.optimism.io', href: 'https://actions.optimism.io' },
      {
        label: 'ethereum-optimism/actions',
        href: 'https://github.com/ethereum-optimism/actions',
      },
    ],
  },
  {
    key: 'metropolis',
    org: 'Metropolis',
    orgQualified: 'Metropolis (0xmetropolis)',
    kind: 'role',
    title: 'Lead Software Engineer',
    start: '2022-09',
    end: '2025-04',
    location: 'Remote, America/Los_Angeles',
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
    achievements: [
      'Built an arbitrary transaction and contract deployment engine.',
      'Shipped tokenization, wallet infrastructure, and a multi-signature module for treasury operations.',
    ],
    evidence: [
      {
        label: 'github.com/0xmetropolis',
        href: 'https://github.com/0xmetropolis',
      },
    ],
  },
  {
    key: 'consensys',
    org: 'ConsenSys',
    orgQualified: null,
    kind: 'role',
    title: 'Lead Blockchain Engineer',
    start: '2021-09',
    end: '2022-09',
    location: 'Remote, America/Los_Angeles',
    stack: ['TypeScript', 'Solidity'],
    achievements: [
      'Maintained Truffle core and box templates, now archived, while making the EVM legible through debugging tools.',
      'Bridged Truffle boxes to L2 networks and led a cross-organization education effort.',
      'Delivered the largest body of work at ConsenSys in 2022.',
    ],
    evidence: [
      {
        label: 'truffle ★13,923',
        href: 'https://github.com/ConsenSys-archive/truffle',
      },
      {
        label: 'ConsenSys-archive',
        href: 'https://github.com/ConsenSys-archive',
      },
    ],
  },
  {
    key: 'stitch-fix',
    org: 'Stitch Fix',
    orgQualified: null,
    kind: 'role',
    title: 'Lead Software Engineer',
    start: '2017-12',
    end: '2021-09',
    location: 'California, USA',
    stack: ['Ruby', 'Rails', 'React', 'TypeScript', 'PostgreSQL', 'GraphQL'],
    achievements: [
      'Led customer-facing features from scope through rollout and built microservice APIs consumed across the organization.',
    ],
    evidence: [{ label: 'stitchfix.com', href: 'https://www.stitchfix.com' }],
  },
  {
    key: 'ems-heroes',
    org: 'EMS Heroes',
    orgQualified: null,
    kind: 'founder',
    title: 'Co-founder and Fullstack Engineer',
    start: '2014-03',
    end: '2017-12',
    location: 'USA',
    stack: ['Ruby', 'Rails', 'JavaScript'],
    achievements: [
      'Co-founded, built, and supported medical records and billing software for emergency medical services.',
    ],
    evidence: [],
  },
  {
    key: 'omni',
    org: 'Omni Developers',
    orgQualified: null,
    kind: 'founder',
    title: 'Founder',
    start: '2010-02',
    end: '2014-03',
    location: 'USA',
    stack: ['PHP', 'JavaScript'],
    achievements: [
      'Founded a software consulting firm and shipped CMS, ecommerce, and healthcare web applications.',
    ],
    evidence: [],
  },
  {
    key: 'rowan',
    org: 'Rowan University',
    orgQualified: null,
    kind: 'education',
    title: 'B.S. Management Information Systems',
    start: '2008-09',
    end: '2012-05',
    location: 'USA',
    stack: ['Management Information Systems', 'Computer Science'],
    achievements: [
      'Earned a B.S. in Management Information Systems with a minor in Computer Science.',
    ],
    evidence: [{ label: 'rowan.edu', href: 'https://www.rowan.edu' }],
  },
] as const satisfies readonly Employer[]
