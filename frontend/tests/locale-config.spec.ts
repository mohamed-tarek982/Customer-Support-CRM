import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import * as vuetifyLocales from 'vuetify/locale'
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  RTL_BY_LOCALE,
  applyDocumentDirection,
  directionFor,
} from '../i18n/locale-config'
import { VUETIFY_MESSAGES } from '../i18n/vuetify-messages'

const LOCALES_DIR = resolve(__dirname, '../i18n/locales')

function readMessages(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(LOCALES_DIR, file), 'utf8')) as Record<string, unknown>
}

/** Flattens { a: { b: 1 } } to ['a.b'] so key sets can be compared across files. */
function flattenKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child !== null && typeof child === 'object'
      ? flattenKeys(child as Record<string, unknown>, path)
      : [path]
  })
}

describe('locale configuration', () => {
  it('registers English and Arabic with the right directions', () => {
    expect(directionFor('en')).toBe('ltr')
    expect(directionFor('ar')).toBe('rtl')
  })

  it('falls back to ltr for an unknown locale instead of throwing', () => {
    expect(directionFor('kl')).toBe('ltr')
  })

  it('has a default locale that is actually registered', () => {
    expect(APP_LOCALES.some((locale) => locale.code === DEFAULT_LOCALE)).toBe(true)
  })

  it('builds the Vuetify rtl map from the same source as the html dir', () => {
    // The half-mirrored-page bug happens when these two disagree.
    for (const locale of APP_LOCALES) {
      expect(RTL_BY_LOCALE[locale.code]).toBe(locale.dir === 'rtl')
    }
  })

  /**
   * Vuetify renders strings our locale files never see: the data-table footer,
   * the empty state, every sort and select aria-label. They come from Vuetify's
   * own bundles, which plugins/vuetify.ts has to register by hand. Registering a
   * locale with i18n and forgetting it there leaves those strings in English on
   * an otherwise Arabic page, and nothing errors.
   */
  it('has a Vuetify message bundle available for every registered locale', () => {
    const available = Object.keys(vuetifyLocales)

    for (const locale of APP_LOCALES) {
      expect(available).toContain(locale.code)
    }
  })

  it('carries a bundle for every locale into the map the Vuetify plugin registers', () => {
    for (const locale of APP_LOCALES) {
      const bundle = VUETIFY_MESSAGES[locale.code] as { dataFooter?: unknown } | undefined

      expect(bundle).toBeTruthy()
      // One representative footer string, so an empty placeholder object fails
      // the assertion the same way a missing entry does.
      expect(bundle?.dataFooter).toBeTruthy()
    }
  })

  it('gives every locale a language tag and a message file', () => {
    for (const locale of APP_LOCALES) {
      expect(locale.language).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(locale.file).toMatch(/[.]json$/)
      expect(() => readMessages(locale.file)).not.toThrow()
    }
  })
})

describe('translation files', () => {
  it('define exactly the same keys in every locale', () => {
    const [first, ...rest] = APP_LOCALES
    const baseline = flattenKeys(readMessages(first!.file)).sort()

    for (const locale of rest) {
      const keys = flattenKeys(readMessages(locale.file)).sort()

      const missing = baseline.filter((key) => !keys.includes(key))
      const extra = keys.filter((key) => !baseline.includes(key))

      expect({ locale: locale.code, missing, extra }).toEqual({
        locale: locale.code,
        missing: [],
        extra: [],
      })
    }
  })

  it('leaves no empty translation strings', () => {
    for (const locale of APP_LOCALES) {
      const messages = readMessages(locale.file)
      const flat = flattenKeys(messages)

      expect(flat.length).toBeGreaterThan(0)
      for (const key of flat) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages)
        expect(String(value).trim()).not.toBe('')
      }
    }
  })
})

describe('applyDocumentDirection', () => {
  let doc: Document

  beforeEach(() => {
    doc = new Window().document as unknown as Document
  })

  it('sets dir="rtl" and lang="ar" for Arabic', () => {
    expect(applyDocumentDirection(doc, 'ar')).toBe('rtl')
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl')
    expect(doc.documentElement.getAttribute('lang')).toBe('ar')
  })

  it('sets dir="ltr" and lang="en" for English', () => {
    expect(applyDocumentDirection(doc, 'en')).toBe('ltr')
    expect(doc.documentElement.getAttribute('dir')).toBe('ltr')
    expect(doc.documentElement.getAttribute('lang')).toBe('en')
  })

  it('switches back cleanly, leaving no stale direction behind', () => {
    applyDocumentDirection(doc, 'ar')
    applyDocumentDirection(doc, 'en')

    expect(doc.documentElement.getAttribute('dir')).toBe('ltr')
    expect(doc.documentElement.getAttribute('lang')).toBe('en')
  })
})
