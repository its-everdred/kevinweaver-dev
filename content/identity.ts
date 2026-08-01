export type ActorId = 'its-everdred' | 'its-applekid'

export interface Actor {
  readonly id: ActorId
  readonly kind: 'human' | 'agent'
  readonly url: string
  readonly since: string
  readonly marker: 'human' | 'agent'
}

export type LinkId =
  'github-human' | 'github-agent' | 'email' | 'linkedin' | 'twitter'

export interface IdentityLink {
  readonly id: LinkId
  readonly label: string
  readonly href: string
  readonly rel: readonly string[]
  readonly external: boolean
  readonly note: string | null
}

export interface FingerField {
  readonly label: string
  readonly value: string
}

export interface Identity {
  readonly name: string
  readonly title: string
  readonly location: string
  readonly timezone: string
  readonly site: string
  readonly email: string | null
  readonly actors: readonly Actor[]
  readonly links: readonly IdentityLink[]
  readonly whoami: string
  readonly idLines: readonly string[]
  readonly finger: readonly FingerField[]
  readonly project: readonly string[]
  readonly plan: readonly string[]
  readonly status: readonly string[]
  readonly curlLines: readonly string[]
}

/** Kept as a single switch for later operator consent. */
export const CONTACT_EMAIL: string | null = null
export const CONTACT_TWITTER: string | null = null

const EXTERNAL_REL = ['me', 'noopener'] as const
export const IDENTITY = {
  name: 'Kevin Weaver',
  title: 'Lead Fullstack Software Engineer',
  location: 'California, USA',
  timezone: 'America/Los_Angeles',
  site: 'kevinweaver.dev',
  email: CONTACT_EMAIL,
  actors: [
    {
      id: 'its-everdred',
      kind: 'human',
      url: 'https://github.com/its-everdred',
      since: '2011-09-01',
      marker: 'human',
    },
    {
      id: 'its-applekid',
      kind: 'agent',
      url: 'https://github.com/its-applekid',
      since: '2026-01-29',
      marker: 'agent',
    },
  ],
  links: [
    {
      id: 'github-human',
      label: 'github.com/its-everdred',
      href: 'https://github.com/its-everdred',
      rel: EXTERNAL_REL,
      external: true,
      note: 'human',
    },
    {
      id: 'github-agent',
      label: 'github.com/its-applekid',
      href: 'https://github.com/its-applekid',
      rel: EXTERNAL_REL,
      external: true,
      note: 'agent',
    },
    {
      id: 'linkedin',
      label: 'linkedin.com/in/kevinweaver',
      href: 'https://linkedin.com/in/kevinweaver',
      rel: EXTERNAL_REL,
      external: true,
      note: null,
    },
  ],
  whoami: 'its-everdred',
  idLines: [
    'uid=2010(kevin) gid=100(engineers) groups=100(engineers),42(web3),7(public-goods),13(hackathons),88(podcasters)',
  ],
  finger: [
    { label: 'Login', value: 'its-everdred' },
    { label: 'Name', value: 'Kevin Weaver' },
    { label: 'Directory', value: '/home/kevin' },
    { label: 'Shell', value: '/usr/bin/zsh' },
    { label: 'Title', value: 'Lead Fullstack Software Engineer' },
    { label: 'Since', value: 'Feb 2010' },
    { label: 'Location', value: 'California, USA' },
    {
      label: 'On since',
      value: 'Mon May 5 09:12 2025 on optimism (messages off)',
    },
    {
      label: 'Also logged in as',
      value: 'its-applekid (agent, tty2, since Thu Jan 29 2026)',
    },
  ],
  project: [
    'Passionate web3 builder, Ethereum enthusiast, & public goods enjoyer',
    "designing human coordination tools on the internet's frontier.",
  ],
  plan: [
    'Technical architect on the Actions SDK - actions.optimism.io.',
    'Connecting embedded wallets to DeFi protocols.',
    'Everything above this line is running. Everything below is history.',
  ],
  status: [],
  curlLines: [
    '$ curl -sL kevinweaver.dev/resume.txt',
    '$ curl -sL kevinweaver.dev/kevinweaver.1 | man -l -',
  ],
} as const satisfies Identity
