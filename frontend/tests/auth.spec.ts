import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeJwt, refreshDelayMs, sessionFromTokens } from '../composables/useAuth'

/**
 * The session composable itself is Nuxt-runtime-bound (useState, $fetch,
 * navigateTo), so these cover the pieces that are pure: JWT decoding, the
 * session it builds from a token pair, and the silent-refresh timing. The
 * network wrappers are exercised end to end by the backend e2e suite.
 */

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`
}

describe('decodeJwt', () => {
  it('reads the payload of a well-formed token', () => {
    const token = makeJwt({ sub: 'u1', userType: 'staff', exp: 1893456000 })
    expect(decodeJwt(token)).toMatchObject({ sub: 'u1', userType: 'staff', exp: 1893456000 })
  })

  it('returns an empty object for a malformed token instead of throwing', () => {
    expect(decodeJwt('not-a-jwt')).toEqual({})
    expect(decodeJwt('')).toEqual({})
  })
})

describe('sessionFromTokens', () => {
  it('lifts userType, role and exp off the access token', () => {
    const accessToken = makeJwt({
      sub: 'u1',
      email: 'a@example.com',
      role: 'admin',
      userType: 'staff',
      exp: 1893456000,
    })
    const session = sessionFromTokens(
      { accessToken, refreshToken: 'r1' },
      { userType: 'customer', role: '', email: 'fallback@example.com', sub: 'fallback' },
    )

    expect(session).toEqual({
      accessToken,
      refreshToken: 'r1',
      sub: 'u1',
      email: 'a@example.com',
      role: 'admin',
      userType: 'staff',
      exp: 1893456000,
    })
  })

  it('falls back to the supplied identity when the token carries no claims', () => {
    const session = sessionFromTokens(
      { accessToken: 'opaque', refreshToken: 'r1' },
      { userType: 'customer', role: '', email: 'c@example.com', sub: 'c1' },
    )
    expect(session.userType).toBe('customer')
    expect(session.sub).toBe('c1')
    expect(session.exp).toBe(0)
  })
})

describe('refreshDelayMs', () => {
  it('fires ~30s before the token expires', () => {
    const now = 1_000_000
    const exp = (now + 120_000) / 1000
    expect(refreshDelayMs(exp, now)).toBe(90_000)
  })

  it('never returns a negative delay for an already-expired token', () => {
    expect(refreshDelayMs(1, 5_000_000)).toBe(0)
  })
})

describe('auth i18n copy', () => {
  const dir = resolve(__dirname, '../i18n/locales')
  const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Record<string, unknown>

  function flatten(value: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(value).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k
      return v !== null && typeof v === 'object'
        ? flatten(v as Record<string, unknown>, path)
        : [path]
    })
  }

  it('defines an identical auth.* key set in English and Arabic', () => {
    const en = flatten(read('en.json')).filter((k) => k.startsWith('auth.')).sort()
    const ar = flatten(read('ar.json')).filter((k) => k.startsWith('auth.')).sort()

    expect(ar).toEqual(en)
    expect(en).toContain('auth.errors.invalidCredentials')
    expect(en).toContain('auth.validation.passwordsMatch')
    expect(en).toContain('auth.logout.button')
  })
})
