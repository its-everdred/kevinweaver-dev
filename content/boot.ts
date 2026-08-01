export type BootKind = 'cmd' | 'ok' | 'warn' | 'dim' | 'agent'

export interface BootLine {
  readonly kind: BootKind
  readonly marker: 'spinner' | 'agent' | null
  readonly template: string
  readonly badge: boolean
}

export type BootToken =
  | 'contributions'
  | 'days'
  | 'repos'
  | 'zeroDays'
  | 'activeDays'
  | 'busiestCount'
  | 'busiestDate'
  | 'massPointDays'
  | 'actors'
  | 'privateVolumes'
  | 'agentSince'
  | 'windowStart'
  | 'repoCountDefinition'
  | 'date'

export const BOOT_LINES = [
  {
    kind: 'cmd',
    marker: null,
    template: '$ boot --target=kevinweaver.dev',
    badge: false,
  },
  {
    kind: 'ok',
    marker: null,
    template: '  swe-rts-terminal · gruvbox dark medium · jetbrains mono',
    badge: true,
  },
  {
    kind: 'cmd',
    marker: null,
    template: '$ mount /dev/github its-everdred its-applekid',
    badge: false,
  },
  {
    kind: 'ok',
    marker: null,
    template:
      '  {actors} actors · {repos} {repoCountDefinition} repos · {privateVolumes} redacted volume',
    badge: true,
  },
  {
    kind: 'cmd',
    marker: null,
    template: '$ fetch contributions --since={windowStart} --merge=sum-per-day',
    badge: false,
  },
  {
    kind: 'ok',
    marker: 'spinner',
    template: '{contributions} contributions across {days} days',
    badge: true,
  },
  {
    kind: 'dim',
    marker: null,
    template: '  {activeDays} active · busiest {busiestCount} on {busiestDate}',
    badge: false,
  },
  {
    kind: 'cmd',
    marker: null,
    template: '$ bin --log2 --steps=10',
    badge: false,
  },
  {
    kind: 'warn',
    marker: null,
    template: '  quantile rejected: {massPointDays}-day mass point at n=1',
    badge: false,
  },
  {
    kind: 'ok',
    marker: null,
    template: '  doubling bands accepted',
    badge: true,
  },
  {
    kind: 'cmd',
    marker: null,
    template: '$ seek --to=now --reverse',
    badge: false,
  },
  {
    kind: 'dim',
    marker: null,
    template: '  playback runs backwards. newest first.',
    badge: false,
  },
  {
    kind: 'dim',
    marker: null,
    template: '  the longer you stay, the further back you get',
    badge: false,
  },
  {
    kind: 'agent',
    marker: 'agent',
    template: 'its-applekid online since {agentSince}',
    badge: false,
  },
  {
    kind: 'cmd',
    marker: null,
    template: '$ render whoami arc contact',
    badge: false,
  },
  { kind: 'ok', marker: null, template: '  ready.', badge: false },
] as const satisfies readonly BootLine[]

export const BOOT_TOKENS = [
  'contributions',
  'days',
  'repos',
  'zeroDays',
  'activeDays',
  'busiestCount',
  'busiestDate',
  'massPointDays',
  'actors',
  'privateVolumes',
  'agentSince',
  'windowStart',
  'repoCountDefinition',
  'date',
] as const satisfies readonly BootToken[]

export const BOOT_PANE_TITLE = 'kevinweaver.dev — cold start'

const TOKEN = /\{([a-zA-Z]+)\}/g

/** Fills a boot template and rejects missing payload values. */
export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>
): string {
  return template.replace(TOKEN, (_match, name: string) => {
    const value = values[name as BootToken]
    if (value === undefined) {
      throw new Error(`content/boot: unresolved token {${name}}`)
    }
    return value
  })
}
