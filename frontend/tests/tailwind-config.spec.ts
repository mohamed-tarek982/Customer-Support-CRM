import { describe, expect, it } from 'vitest'
import tailwindConfig from '../tailwind.config'
import { palette, spacing } from '../design-tokens'

/**
 * Guards the two configuration facts that fail silently in the browser.
 *
 * Re-enabling Preflight does not throw — Vuetify components just quietly lose
 * their base styles. Duplicating a hex does not throw either — the two systems
 * just drift apart by a shade nobody notices in review.
 */
describe('tailwind.config.ts', () => {
  it('keeps Preflight disabled so Vuetify base styles survive', () => {
    expect(tailwindConfig.corePlugins).toBeDefined()
    expect((tailwindConfig.corePlugins as { preflight: boolean }).preflight).toBe(false)
  })

  it('builds its palette from the shared token module, not a copy', () => {
    // Reference equality, not deep equality: a copied object would pass a deep
    // check today and drift tomorrow.
    expect(tailwindConfig.theme?.extend?.colors).toBe(palette)
  })

  it('resolves bg-primary to the same hex Vuetify uses for color="primary"', () => {
    const colors = tailwindConfig.theme?.extend?.colors as typeof palette

    expect(colors.primary).toBe(palette.primary)
    expect(colors.secondary).toBe(palette.secondary)
    expect(colors.success).toBe(palette.success)
    expect(colors.warning).toBe(palette.warning)
    expect(colors.error).toBe(palette.error)
    expect(colors.surface).toBe(palette.surface)
    expect(colors.background).toBe(palette.background)
  })

  it('shares the spacing scale with the token module', () => {
    expect(tailwindConfig.theme?.extend?.spacing).toBe(spacing)
  })

  it('scans every directory that can contain a class name', () => {
    const content = tailwindConfig.content as string[]

    for (const dir of ['pages', 'layouts', 'components', 'plugins', 'composables']) {
      expect(content.some((pattern) => pattern.includes(dir))).toBe(true)
    }
    expect(content).toContain('./app.vue')
  })

  it('adds no logical-property plugin, because Tailwind 3.3+ ships them natively', () => {
    expect(tailwindConfig.plugins).toEqual([])
  })
})

describe('design tokens', () => {
  it('exposes every palette hex for the drift checker', () => {
    const { paletteHexes } = { paletteHexes: Object.values(palette) }

    expect(paletteHexes).toHaveLength(Object.keys(palette).length)
    for (const hex of paletteHexes) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('keeps the spacing scale on Tailwind 4px rhythm', () => {
    expect(spacing[1]).toBe('4px')
    expect(spacing[4]).toBe('16px')
    expect(spacing[12]).toBe('48px')
  })
})
