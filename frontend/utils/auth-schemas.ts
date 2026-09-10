import * as yup from 'yup'
import { homePathFor } from './routes'

/**
 * Yup schemas for the auth forms, built from a translator so the messages are
 * localized. Kept out of the SFCs so they can be unit-tested without mounting a
 * Nuxt page.
 *
 * This duplicates the class-validator rules on the API on purpose (see
 * plugins/vee-validate.ts): the frontend needs instant feedback, the backend
 * cannot trust the frontend, and a shared schema would couple two release cycles.
 */
type Translate = (key: string) => string

export function buildLoginSchema(t: Translate) {
  return yup.object({
    email: yup
      .string()
      .required(t('auth.validation.emailRequired'))
      .email(t('auth.validation.emailFormat')),
    password: yup
      .string()
      .required(t('auth.validation.passwordRequired'))
      .min(8, t('auth.validation.passwordMin')),
  })
}

export function buildForgotSchema(t: Translate) {
  return yup.object({
    email: yup
      .string()
      .required(t('auth.validation.emailRequired'))
      .email(t('auth.validation.emailFormat')),
  })
}

export function buildResetSchema(t: Translate) {
  return yup.object({
    newPassword: yup
      .string()
      .required(t('auth.validation.passwordRequired'))
      .min(8, t('auth.validation.passwordMin')),
    confirmPassword: yup
      .string()
      .required(t('auth.validation.passwordRequired'))
      .oneOf([yup.ref('newPassword')], t('auth.validation.passwordsMatch')),
  })
}

/**
 * Post-login destination rule: return the user to the route they originally
 * asked for, but only if their `userType` is allowed there; otherwise send them
 * to their type's home. `metaUserTypesFor` resolves a path to its
 * `definePageMeta({ userTypes })`, or undefined when the route places no limit.
 */
export function resolvePostLoginTarget(
  redirect: string | null | undefined,
  userType: 'staff' | 'customer',
  metaUserTypesFor: (path: string) => ('staff' | 'customer')[] | undefined,
): string {
  const home = homePathFor(userType)
  if (!redirect) return home
  const allowed = metaUserTypesFor(redirect)
  if (!allowed || allowed.includes(userType)) return redirect
  return home
}

/**
 * Map a failed auth request to the i18n key the form should show.
 *
 * Only a real 401 may say "incorrect email or password". A dead API, a CORS
 * failure or a 500 used to render that same line, which made an unreachable
 * backend indistinguishable from a typo'd password. 429 gets its own copy
 * because login is rate limited (10/min per IP) and retrying makes it worse.
 *
 * The 401 copy stays generic on purpose: the API returns one response for
 * "no such email", "wrong password" and "wrong table", and the UI must not
 * undo that.
 */
export function authErrorKey(err: unknown): string {
  const status = httpStatusOf(err)
  if (status === 401) return 'auth.errors.invalidCredentials'
  if (status === 429) return 'auth.errors.rateLimited'
  if (status === undefined) return 'auth.errors.network'
  return 'auth.errors.generic'
}

/**
 * Pull the HTTP status off an ofetch `FetchError`. Returns undefined when the
 * request never got a response at all (offline, DNS, CORS, connection refused).
 */
export function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  for (const candidate of [e.statusCode, e.status, e.response?.status]) {
    if (typeof candidate === 'number') return candidate
  }
  return undefined
}
