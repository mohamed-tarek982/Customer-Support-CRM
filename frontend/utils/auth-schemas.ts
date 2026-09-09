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
