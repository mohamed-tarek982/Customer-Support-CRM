import * as vuetifyLocales from 'vuetify/locale'
import { APP_LOCALES } from './locale-config'

/**
 * Vuetify's own UI strings, one bundle per registered locale.
 *
 * Vuetify renders text that never passes through i18n/locales/*.json: the
 * data-table footer ("Items per page", "1-25 of 90"), the empty state, the
 * pagination buttons, and every sort/select aria-label. Those come from
 * Vuetify's internal message bundles, which are English-only until they are
 * registered on the instance.
 *
 * Kept out of plugins/vuetify.ts so it can be tested without booting Vuetify:
 * that plugin imports every component, and every component imports its CSS,
 * which a plain Node test runner cannot load. This module imports only
 * `vuetify/locale`, which is plain data.
 *
 * A locale with no Vuetify bundle is omitted rather than fatal — Vuetify falls
 * back to `DEFAULT_LOCALE` for it, which degrades to English rather than
 * breaking the build. The parity test in tests/locale-config.spec.ts is what
 * makes that omission visible instead of silent.
 */
/**
 * Structurally what Vuetify's own `LocaleMessages` is. Declared here rather than
 * imported: Vuetify exports the type only from an internal path, and reaching
 * into one would break on any release that reorganises the build.
 */
export type VuetifyLocaleMessages = { [key: string]: VuetifyLocaleMessages | string }

export const VUETIFY_MESSAGES: Record<string, VuetifyLocaleMessages> = Object.fromEntries(
  APP_LOCALES.map((locale) => [
    locale.code,
    (vuetifyLocales as unknown as Record<string, VuetifyLocaleMessages | undefined>)[locale.code],
  ]).filter((entry): entry is [string, VuetifyLocaleMessages] => Boolean(entry[1])),
)
