import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { palette } from '~/design-tokens'
import { DEFAULT_LOCALE, RTL_BY_LOCALE } from '~/i18n/locale-config'

/**
 * Vuetify owns component internals. Everything visual about a Vuetify component
 * is set here or through its props — never by reaching in with a Tailwind class.
 * See the root README, "Styling boundaries".
 *
 * The theme colours come from the same token module tailwind.config.ts extends
 * its palette from. That is what makes color="primary" and bg-primary one hex.
 *
 * Exported so plugins/rtl.client.ts can drive the locale without going through
 * a Nuxt injection, which is not typed inside plugins.
 */
export const vuetify = createVuetify({
  components,
  directives,

  locale: {
    locale: DEFAULT_LOCALE,
    fallback: DEFAULT_LOCALE,
    // Built from i18n/locale-config.ts so a new locale cannot be registered with
    // i18n and forgotten here.
    rtl: RTL_BY_LOCALE,
  },

  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: palette.primary,
          secondary: palette.secondary,
          success: palette.success,
          warning: palette.warning,
          error: palette.error,
          surface: palette.surface,
          background: palette.background,
        },
      },
    },
  },
})

export default defineNuxtPlugin({
  name: 'vuetify',

  setup(nuxtApp) {
    nuxtApp.vueApp.use(vuetify)
  },
})
