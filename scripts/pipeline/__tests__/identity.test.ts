import { describe, expect, it } from 'vitest'
import thirdPartyIdentities from './fixtures/third-party-identities.json'
import { ACTOR_IDS, ALLOWLIST, actorId, classify } from '../identity'

describe('identity allowlist', () => {
  it('classifies the measured actor addresses', () => {
    expect(classify(' kevinw@OPLABS.CO ')).toBe('its-everdred')
    expect(classify('its.everdred@gmail.com')).toBe('its-everdred')
    expect(classify('kevinweaver2@gmail.com')).toBe('its-everdred')
    expect(classify('its-everdred@users.noreply.github.com')).toBe(
      'its-everdred'
    )
    expect(classify('1020682+its-everdred@users.noreply.github.com')).toBe(
      'its-everdred'
    )
    expect(classify('its.applekid@gmail.com')).toBe('its-applekid')
    expect(classify('its-applekid@users.noreply.github.com')).toBe(
      'its-applekid'
    )
    expect(classify('257914776+its-applekid@users.noreply.github.com')).toBe(
      'its-applekid'
    )
    expect(classify('applekid.mail@proton.me')).toBe('its-applekid')
  })

  it('rejects every measured third-party identity', () => {
    thirdPartyIdentities.forEach(({ email }) =>
      expect(classify(email)).toBeNull()
    )
    expect(classify('Kevin Weaver <kevinweaver2@gmail.com>')).toBeNull()
    expect(classify('kevinw@oplabs.co extra')).toBeNull()
  })

  it('is total for missing and empty input', () => {
    expect(classify(null)).toBeNull()
    expect(classify(undefined)).toBeNull()
    expect(classify('')).toBeNull()
    expect(actorId('its-everdred')).toBe(ACTOR_IDS['its-everdred'])
    expect(actorId('its-applekid')).toBe(ACTOR_IDS['its-applekid'])
    expect(ALLOWLIST['its-applekid']).toContain('applekid.mail@proton.me')
  })
})
