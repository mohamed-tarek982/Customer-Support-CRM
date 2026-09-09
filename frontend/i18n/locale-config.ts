/**
 * LOCALE METADATA — SINGLE SOURCE OF TRUTH.
 *
 * Consumed by:
 *   - nuxt.config.ts        to register the locales with @nuxtjs/i18n
 *   - plugins/vuetify.ts    to build Vuetify's rtl map
 *   - plugins/rtl.client.ts to resolve the <html dir> for the active locale
 *
 * Adding a locale means adding one entry here plus its JSON file in
 * i18n/locales/. Nothing else should hard-code a locale code or a direction —
 * a locale registered in one place and forgotten in another is exactly how a
 * page ends up half-mirrored.
 */

// A type alias, not an interface: @nuxtjs/i18n's LocaleObject carries an index
// signature, and interfaces are not assignable to one (they can be augmented
// later, so TypeScript will not infer an implicit index signature for them).
export type AppLocale = {
  code: string
  /** BCP 47 tag, used for the html lang attribute and Vuetify date formatting. */
  language: string
  dir: 'ltr' | 'rtl'
  /** Shown in the language switcher, in the language itself. */
  name: string
  file: string
}

export const APP_LOCALES: AppLocale[] = [
  { code: 'en', language: 'en-US', dir: 'ltr', name: 'English', file: 'en.json' },
  { code: 'ar', language: 'ar-EG', dir: 'rtl', name: 'العربية', file: 'ar.json' },
]

export const DEFAULT_LOCALE = 'en'

/** `{ en: false, ar: true }` — the shape Vuetify's locale.rtl option expects. */
export const RTL_BY_LOCALE: Record<string, boolean> = Object.fromEntries(
  APP_LOCALES.map((locale) => [locale.code, locale.dir === 'rtl']),
)

export function directionFor(code: string): 'ltr' | 'rtl' {
  return APP_LOCALES.find((locale) => locale.code === code)?.dir ?? 'ltr'
}

/**
 * Writes the reading direction onto <html>, which is what Tailwind's logical
 * utilities (ps-, pe-, ms-, me-, text-start, text-end) key off.
 *
 * Split out of plugins/rtl.client.ts so it can be tested without booting Nuxt —
 * the failure mode here is silent, so it needs a test rather than a code read.
 */
export function applyDocumentDirection(doc: Document, code: string): 'ltr' | 'rtl' {
  const dir = directionFor(code)

  doc.documentElement.setAttribute('dir', dir)
  doc.documentElement.setAttribute('lang', code)

  return dir
}
