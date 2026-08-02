/**
 * @description Builds the clone or refresh command for one bare cache.
 * @param repo Public repository name.
 * @param directory Bare-cache directory.
 * @param cached Whether a validated cache already exists.
 * @returns Git arguments without the executable name.
 */
export function cloneCommand(
  repo: string,
  directory: string,
  cached: boolean
): string[] {
  return cached
    ? [
        '-C',
        directory,
        'fetch',
        '--filter=blob:none',
        '--prune',
        '--prune-tags',
        '--tags',
        'origin',
        '+refs/heads/*:refs/heads/*',
      ]
    : [
        'clone',
        '--filter=blob:none',
        '--bare',
        '--',
        `https://github.com/${repo}.git`,
        directory,
      ]
}

/**
 * @description Builds the command that snapshots local branch heads.
 * @param directory Bare-cache directory.
 * @returns Git arguments without the executable name.
 */
export function headsCommand(directory: string): string[] {
  return [
    '-C',
    directory,
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    'refs/heads',
  ]
}

/**
 * @description Extracts the last non-empty diagnostic line from Git stderr.
 * @param stderr Git standard error text.
 * @returns Trimmed final line, or null when no diagnostic was emitted.
 */
export function trimGitError(stderr: string): string | null {
  return stderr.trim().split('\n').filter(Boolean).at(-1)?.trim() ?? null
}
