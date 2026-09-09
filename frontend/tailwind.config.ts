import type { Config } from 'tailwindcss'
import { palette, spacing } from './design-tokens'

export default {
  content: [
    './components/**/*.{vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.ts',
    './composables/**/*.ts',
    './app.vue',
    './error.vue',
  ],

  corePlugins: {
    /**
     * REQUIRED. Preflight is Tailwind's CSS reset, and it strips the base
     * styles Vuetify components depend on — buttons lose their padding, cards
     * lose their elevation, and nothing errors. Turning it back on breaks the
     * whole component library silently.
     *
     * tests/tailwind-config.spec.ts asserts this stays false.
     * See the root README, "Styling boundaries".
     */
    preflight: false,
  },

  theme: {
    extend: {
      // Same object the Vuetify theme is built from, so `bg-primary` (Tailwind)
      // and color="primary" (Vuetify) resolve to one hex, defined once.
      colors: palette,
      spacing,
    },
  },

  /**
   * No logical-property plugin is needed: Tailwind has shipped ps-/pe-/ms-/me-/
   * start-/end-/text-start/text-end natively since v3.3, which is what the lint
   * rule in eslint.config.mjs requires you to use. Adding tailwindcss-logical on
   * top would duplicate those utilities.
   */
  plugins: [],
} satisfies Config
