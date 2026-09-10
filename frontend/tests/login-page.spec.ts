import { describe, expect, it } from 'vitest'
import {
  authErrorKey,
  buildLoginSchema,
  buildResetSchema,
  httpStatusOf,
  resolvePostLoginTarget,
} from '../utils/auth-schemas'

/**
 * The login SFC is a Nuxt page (definePageMeta, useI18n, Vuetify), which cannot
 * be mounted without the Nuxt build. Its testable logic — the validation schema
 * and the post-login redirect rule — lives in utils/auth-schemas.ts and is
 * covered here. The rendered form, the 401 error banner and the RTL layout are
 * verified in the manual smoke steps and the backend e2e suite.
 */

// Identity translator: assert on the key, not the copy, so these do not break
// every time wording changes.
const t = (key: string) => key

async function firstError(schema: ReturnType<typeof buildLoginSchema>, value: unknown) {
  try {
    await schema.validate(value, { abortEarly: true })
    return null
  } catch (err) {
    return (err as { message: string }).message
  }
}

describe('login validation schema', () => {
  const schema = buildLoginSchema(t)

  it('flags a missing email with the localized key', async () => {
    expect(await firstError(schema, { email: '', password: 'longenough' })).toBe(
      'auth.validation.emailRequired',
    )
  })

  it('flags a malformed email', async () => {
    expect(await firstError(schema, { email: 'nope', password: 'longenough' })).toBe(
      'auth.validation.emailFormat',
    )
  })

  it('flags a short password', async () => {
    expect(await firstError(schema, { email: 'a@example.com', password: 'x' })).toBe(
      'auth.validation.passwordMin',
    )
  })

  it('accepts a valid pair', async () => {
    await expect(
      schema.validate({ email: 'a@example.com', password: 'longenough' }),
    ).resolves.toBeTruthy()
  })
})

describe('reset validation schema', () => {
  const schema = buildResetSchema(t)

  it('requires the confirmation to match', async () => {
    await expect(
      schema.validate({ newPassword: 'longenough', confirmPassword: 'different1' }),
    ).rejects.toMatchObject({ message: 'auth.validation.passwordsMatch' })
  })

  it('accepts a matching pair', async () => {
    await expect(
      schema.validate({ newPassword: 'longenough', confirmPassword: 'longenough' }),
    ).resolves.toBeTruthy()
  })
})

describe('resolvePostLoginTarget', () => {
  const noMeta = () => undefined

  it('sends staff home when there is no redirect', () => {
    expect(resolvePostLoginTarget(null, 'staff', noMeta)).toBe('/staff')
  })

  it('sends a customer to the portal when there is no redirect', () => {
    expect(resolvePostLoginTarget(undefined, 'customer', noMeta)).toBe('/portal')
  })

  it('honours a redirect the user type is allowed to see', () => {
    expect(resolvePostLoginTarget('/staff/tickets/9', 'staff', () => ['staff'])).toBe(
      '/staff/tickets/9',
    )
  })

  it('drops a redirect the user type is not allowed to see and goes home', () => {
    expect(resolvePostLoginTarget('/portal/orders', 'staff', () => ['customer'])).toBe('/staff')
  })

  it('honours a redirect to a route with no type restriction', () => {
    expect(resolvePostLoginTarget('/settings', 'customer', noMeta)).toBe('/settings')
  })
})

describe('authErrorKey', () => {
  it('maps a 401 to the generic invalid-credentials copy', () => {
    expect(authErrorKey({ statusCode: 401 })).toBe('auth.errors.invalidCredentials')
  })

  it('maps a 429 to its own rate-limit copy', () => {
    expect(authErrorKey({ statusCode: 429 })).toBe('auth.errors.rateLimited')
  })

  it('maps a 500 to the generic failure copy, not a wrong password', () => {
    expect(authErrorKey({ statusCode: 500 })).toBe('auth.errors.generic')
  })

  // The regression this whole helper exists for: a backend that is not running
  // rejects with no status at all, and used to render "incorrect password".
  it('maps a response-less failure to the network copy', () => {
    expect(authErrorKey(new TypeError('Failed to fetch'))).toBe('auth.errors.network')
    expect(authErrorKey(undefined)).toBe('auth.errors.network')
  })

  it('reads the status off response.status when statusCode is absent', () => {
    expect(authErrorKey({ response: { status: 401 } })).toBe('auth.errors.invalidCredentials')
    expect(httpStatusOf({ status: 429 })).toBe(429)
    expect(httpStatusOf({ statusCode: 'nope' })).toBeUndefined()
  })
})
