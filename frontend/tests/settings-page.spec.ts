import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LOCALE_OPTIONS,
  SETTINGS_DEFAULTS,
  SETTING_KEYS,
  buildSettingsSchema,
  canEditSettings,
  changedKeys,
  toFormModel,
  type SettingsForm,
} from '../utils/settings-form'
import { APP_LOCALES } from '../i18n/locale-config'

/**
 * The settings SFC is a Nuxt page (definePageMeta, useI18n, Vuetify) and cannot
 * be mounted without the Nuxt build, so the same split as login applies: the
 * page's decisions live in utils/settings-form.ts and are covered here, and the
 * rendered form is covered by the manual smoke steps and the backend e2e suite.
 */

// Identity translator: assert on the key, not the copy.
const t = (key: string) => key

const SERVER_VALUES = {
  'org.name': 'CRM',
  'org.timezone': 'UTC',
  'org.defaultLocale': 'en',
  'org.dateFormat': 'yyyy-MM-dd',
  'features.customerPortal': true,
}

const FORM: SettingsForm = {
  orgName: 'CRM',
  timezone: 'UTC',
  defaultLocale: 'en',
  dateFormat: 'yyyy-MM-dd',
  customerPortal: true,
}

async function firstError(schema: ReturnType<typeof buildSettingsSchema>, value: unknown) {
  try {
    await schema.validate(value, { abortEarly: true })
    return null
  } catch (err) {
    return (err as { message: string }).message
  }
}

describe('toFormModel', () => {
  it('maps every API key onto its form field', () => {
    expect(toFormModel(SERVER_VALUES)).toEqual(FORM)
  })

  it('falls back to defaults on an unseeded database', () => {
    expect(toFormModel({})).toEqual(SETTINGS_DEFAULTS)
  })

  it('ignores a value of the wrong type rather than binding it into an input', () => {
    const model = toFormModel({ ...SERVER_VALUES, 'features.customerPortal': 'yes' })

    expect(model.customerPortal).toBe(SETTINGS_DEFAULTS.customerPortal)
  })
})

describe('changedKeys', () => {
  it('is empty when nothing was edited, which is what suppresses the request', () => {
    expect(changedKeys(FORM, { ...FORM })).toEqual({})
  })

  it('sends only the edited field, keyed the way the API expects', () => {
    expect(changedKeys(FORM, { ...FORM, orgName: 'Acme Support' })).toEqual({
      'org.name': 'Acme Support',
    })
  })

  it('carries a toggled boolean through as a boolean, not a string', () => {
    expect(changedKeys(FORM, { ...FORM, customerPortal: false })).toEqual({
      'features.customerPortal': false,
    })
  })

  it('collects several edits into one patch', () => {
    expect(
      changedKeys(FORM, { ...FORM, orgName: 'Acme', defaultLocale: 'ar' }),
    ).toEqual({ 'org.name': 'Acme', 'org.defaultLocale': 'ar' })
  })
})

describe('canEditSettings', () => {
  it('lets an admin submit', () => {
    expect(canEditSettings('admin')).toBe(true)
  })

  it('holds an agent to read-only', () => {
    expect(canEditSettings('agent')).toBe(false)
  })

  it('treats a missing role as read-only rather than as an admin', () => {
    expect(canEditSettings(null)).toBe(false)
    expect(canEditSettings(undefined)).toBe(false)
    expect(canEditSettings('')).toBe(false)
  })
})

describe('locale options', () => {
  it('come from the locale config rather than a hard-coded list', () => {
    expect(LOCALE_OPTIONS.map((option) => option.value)).toEqual(
      APP_LOCALES.map((locale) => locale.code),
    )
  })

  it('label each locale in its own language', () => {
    expect(LOCALE_OPTIONS.find((option) => option.value === 'ar')?.title).toBe('العربية')
  })
})

describe('settings validation schema', () => {
  const schema = buildSettingsSchema(t)

  it('flags a blank organisation name with the localized key', async () => {
    expect(await firstError(schema, { ...FORM, orgName: '' })).toBe(
      'settings.validation.orgNameRequired',
    )
  })

  it('flags an over-long organisation name', async () => {
    expect(await firstError(schema, { ...FORM, orgName: 'x'.repeat(121) })).toBe(
      'settings.validation.orgNameMax',
    )
  })

  it('flags a blank timezone', async () => {
    expect(await firstError(schema, { ...FORM, timezone: '' })).toBe(
      'settings.validation.timezoneRequired',
    )
  })

  it('rejects a language that is not registered', async () => {
    expect(await firstError(schema, { ...FORM, defaultLocale: 'fr' })).toBe(
      'settings.validation.defaultLocaleUnknown',
    )
  })

  it('accepts every registered language', async () => {
    for (const locale of APP_LOCALES) {
      await expect(
        schema.validate({ ...FORM, defaultLocale: locale.code }),
      ).resolves.toBeTruthy()
    }
  })

  it('accepts the seeded values unchanged', async () => {
    await expect(schema.validate(FORM)).resolves.toBeTruthy()
  })
})

describe('settings i18n copy', () => {
  const dir = resolve(__dirname, '../i18n/locales')
  const read = (file: string) =>
    JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as Record<string, unknown>

  function flatten(value: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return child !== null && typeof child === 'object'
        ? flatten(child as Record<string, unknown>, path)
        : [path]
    })
  }

  const settingsKeys = (file: string) =>
    flatten(read(file))
      .filter((key) => key.startsWith('settings.'))
      .sort()

  it('defines an identical settings.* key set in English and Arabic', () => {
    expect(settingsKeys('ar.json')).toEqual(settingsKeys('en.json'))
  })

  it('covers every label, action and error the page renders', () => {
    const keys = settingsKeys('en.json')

    for (const field of Object.keys(SETTING_KEYS)) {
      const key =
        field === 'customerPortal'
          ? 'settings.fields.features.customerPortal'
          : `settings.fields.${field}`
      expect(keys).toContain(key)
    }

    expect(keys).toContain('settings.actions.save')
    expect(keys).toContain('settings.saved')
    expect(keys).toContain('settings.errors.forbidden')
    expect(keys).toContain('settings.errors.validation')
    expect(keys).toContain('settings.readOnlyNotice')
  })

  it('names every validation message the schema can emit', () => {
    const keys = settingsKeys('en.json')

    for (const message of [
      'settings.validation.orgNameRequired',
      'settings.validation.orgNameMax',
      'settings.validation.timezoneRequired',
      'settings.validation.defaultLocaleRequired',
      'settings.validation.defaultLocaleUnknown',
      'settings.validation.dateFormatRequired',
    ]) {
      expect(keys).toContain(message)
    }
  })
})
