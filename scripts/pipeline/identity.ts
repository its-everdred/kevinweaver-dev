export type ActorLogin = 'its-everdred' | 'its-applekid'
export type ActorId = 0 | 1

const ACTOR_LOGINS: readonly ActorLogin[] = ['its-everdred', 'its-applekid']

/** Stable actor ids. Order is fixed forever because it is written into the bundle. */
export const ACTOR_IDS: Readonly<Record<ActorLogin, ActorId>> = {
  'its-everdred': 0,
  'its-applekid': 1,
}

/** Exact-match author addresses, lowercased. */
export const ALLOWLIST: Readonly<Record<ActorLogin, readonly string[]>> = {
  'its-everdred': [
    'kevinw@oplabs.co',
    'its.everdred@gmail.com',
    'kevinweaver2@gmail.com',
    'its-everdred@users.noreply.github.com',
  ],
  'its-applekid': [
    'its.applekid@gmail.com',
    'its-applekid@users.noreply.github.com',
    'applekid.mail@proton.me',
  ],
}

/** Numeric GitHub noreply addresses, per actor. */
export const NOREPLY_PATTERNS: Readonly<Record<ActorLogin, RegExp>> = {
  'its-everdred': /^\d+\+its-everdred@users\.noreply\.github\.com$/i,
  'its-applekid': /^\d+\+its-applekid@users\.noreply\.github\.com$/i,
}

/**
 * Classifies a commit author by exact email address.
 * @param authorEmail Bare author email from the commit record.
 * @returns The matching actor login, or null for an unknown address.
 */
export function classify(
  authorEmail: string | null | undefined
): ActorLogin | null {
  const email = authorEmail?.trim().toLowerCase()
  if (!email) return null

  for (const login of ACTOR_LOGINS) {
    if (
      ALLOWLIST[login].includes(email) ||
      NOREPLY_PATTERNS[login].test(email)
    ) {
      return login
    }
  }
  return null
}

/**
 * Converts an actor login to its stable bundle id.
 * @param login Actor login from the allowlist.
 * @returns The stable numeric actor id.
 */
export function actorId(login: ActorLogin): ActorId {
  return ACTOR_IDS[login]
}
