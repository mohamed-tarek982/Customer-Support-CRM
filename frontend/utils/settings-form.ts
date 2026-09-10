import * as yup from 'yup'
import { APP_LOCALES } from '../i18n/locale-config'

/**
 * Settings form logic, kept out of the SFC so it can be unit-tested without
 * mounting a Nuxt page (same split as utils/auth-schemas.ts).
 *
 * The key strings here mirror `SETTINGS_SCHEMA` in
 * `backend/src/modules/settings/settings.constants.ts`. Duplicated on purpose:
 * the frontend gives instant feedback, the backend cannot trust the frontend,
 * and a shared schema would couple two release cycles. Adding a setting means
 * editing both, plus both locale files.
 */
type Translate = (key: string) => string

export interface SettingsForm {
  orgName: string
  timezone: string
  defaultLocale: string
  dateFormat: string
  customerPortal: boolean
}

/** Form field name → the API key it is stored under. */
export const SETTING_KEYS: Record<keyof SettingsForm, string> = {
  orgName: 'org.name',
  timezone: 'org.timezone',
  defaultLocale: 'org.defaultLocale',
  dateFormat: 'org.dateFormat',
  customerPortal: 'features.customerPortal',
}

/**
 * Rendered when a key has no row yet — an unseeded database returns `{}` and the
 * form still has to render rather than binding `undefined` into an input.
 */
export const SETTINGS_DEFAULTS: SettingsForm = {
  orgName: '',
  timezone: 'UTC',
  defaultLocale: 'en',
  dateFormat: 'yyyy-MM-dd',
  customerPortal: false,
}

/** Locale options for the select, sourced from the locale config, never hard-coded. */
export const LOCALE_OPTIONS = APP_LOCALES.map((locale) => ({
  value: locale.code,
  title: locale.name,
}))

/** Only an admin may write; everyone else gets the same values, read-only. */
export function canEditSettings(role: string | null | undefined): boolean {
  return role === 'admin'
}

/** Maps the flat API response onto the form model, falling back per field. */
export function toFormModel(settings: Record<string, unknown>): SettingsForm {
  const text = (key: string, fallback: string): string =>
    typeof settings[key] === 'string' ? (settings[key] as string) : fallback

  return {
    orgName: text(SETTING_KEYS.orgName, SETTINGS_DEFAULTS.orgName),
    timezone: text(SETTING_KEYS.timezone, SETTINGS_DEFAULTS.timezone),
    defaultLocale: text(SETTING_KEYS.defaultLocale, SETTINGS_DEFAULTS.defaultLocale),
    dateFormat: text(SETTING_KEYS.dateFormat, SETTINGS_DEFAULTS.dateFormat),
    customerPortal:
      typeof settings[SETTING_KEYS.customerPortal] === 'boolean'
        ? (settings[SETTING_KEYS.customerPortal] as boolean)
        : SETTINGS_DEFAULTS.customerPortal,
  }
}

/**
 * The patch to PUT: only fields the admin actually changed.
 *
 * Sending the whole form would stamp `updatedBy` onto every row on every save
 * and would clobber a concurrent admin's edit to a field this admin never
 * touched. A diff keeps a save scoped to what was edited.
 */
export function changedKeys(
  original: SettingsForm,
  current: SettingsForm,
): Record<string, string | boolean> {
  const patch: Record<string, string | boolean> = {}

  for (const field of Object.keys(SETTING_KEYS) as (keyof SettingsForm)[]) {
    if (current[field] !== original[field]) {
      patch[SETTING_KEYS[field]] = current[field]
    }
  }

  return patch
}

export function buildSettingsSchema(t: Translate) {
  return yup.object({
    orgName: yup
      .string()
      .required(t('settings.validation.orgNameRequired'))
      .max(120, t('settings.validation.orgNameMax')),
    timezone: yup.string().required(t('settings.validation.timezoneRequired')),
    defaultLocale: yup
      .string()
      .required(t('settings.validation.defaultLocaleRequired'))
      .oneOf(
        APP_LOCALES.map((locale) => locale.code),
        t('settings.validation.defaultLocaleUnknown'),
      ),
    dateFormat: yup.string().required(t('settings.validation.dateFormatRequired')),
    customerPortal: yup.boolean().required(),
  })
}
