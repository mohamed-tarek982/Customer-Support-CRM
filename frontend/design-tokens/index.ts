/**
 * DESIGN TOKENS — SINGLE SOURCE OF TRUTH.
 *
 * Consumed by BOTH:
 *   - plugins/vuetify.ts   so `color="primary"` on a Vuetify component resolves here
 *   - tailwind.config.ts   so `bg-primary` / `text-primary` resolve to the same value
 *
 * A palette hex code must NEVER be written anywhere else in the repository.
 * `scripts/check-token-drift.sh` runs in CI and fails the build if one is, which
 * is what stops `color="primary"` and `bg-primary` from silently drifting apart.
 *
 * To add or change a colour, edit it here only. See the root README, "Design
 * tokens".
 */

export const palette = {
  primary: '#1E6FEB',
  secondary: '#5A6270',
  success: '#1F8A4C',
  warning: '#C97A0B',
  error: '#C0392B',
  surface: '#FFFFFF',
  background: '#F6F7F9',
} as const

/**
 * Spacing scale, in lockstep with Tailwind's default 4px rhythm.
 * The key is the Tailwind suffix, so `ps-4` resolves to spacing[4].
 */
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const

export type PaletteToken = keyof typeof palette
export type SpacingToken = keyof typeof spacing

/** Every palette hex. Used by the token-drift checker and by the config tests. */
export const paletteHexes: readonly string[] = Object.values(palette)
