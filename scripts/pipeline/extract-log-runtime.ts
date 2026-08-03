/** Builds the fixed, author-date-only Git log invocation. */
export function gitLogArgs(directory: string): string[] {
  return [
    '-C',
    directory,
    '-c',
    'core.quotePath=false',
    'log',
    '--all',
    '--no-merges',
    '--no-renames',
    '--no-mailmap',
    '--name-only',
    '--pretty=format:%x01%H%x1f%aI%x1f%ae',
  ]
}

/** Removes credentials before invoking a local Git process. */
export function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.GITHUB_TOKEN
  delete environment.GH_TOKEN
  delete environment.CONTRIB_TOKEN
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
  }
}
