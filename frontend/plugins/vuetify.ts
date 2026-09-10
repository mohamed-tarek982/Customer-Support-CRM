import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { palette } from '~/design-tokens'
import { DEFAULT_LOCALE, RTL_BY_LOCALE } from '~/i18n/locale-config'
import { VUETIFY_MESSAGES } from '~/i18n/vuetify-messages'

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

  // `mdi-svg` ships real SVG path data through Vuetify's own aliases (the
  // close/cancel/success/… icons every built-in component reaches for), which
  // is what makes them render at all: Vuetify's OTHER default icon set is
  // class-based (`class="mdi mdi-close"`) and needs `@mdi/font`'s CSS loaded to
  // paint anything, which this app deliberately does not ship (see
  // components/AppShell.vue — the nav icons are inline SVG for the same
  // reason). Without one or the other, every built-in icon — a chip's close
  // button, a select's dropdown arrow, an alert's icon, a data table's sort
  // arrows — is an empty box.
  //
  // To use an MDI icon anywhere in the app: import the named path constant
  // from `@mdi/js` (e.g. `import { mdiClose } from '@mdi/js'`) and pass it as
  // `<v-icon :icon="mdiClose" />` or a `*-icon` prop. Never type `icon="mdi-…"`
  // as a string — that is the class-based syntax and resolves to nothing here.
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },

  locale: {
    locale: DEFAULT_LOCALE,
    fallback: DEFAULT_LOCALE,
    // Built from i18n/locale-config.ts so a new locale cannot be registered with
    // i18n and forgotten here.
    rtl: RTL_BY_LOCALE,
    // Vuetify's own strings — data-table footer, empty state, sort and select
    // aria-labels — stay English without these, on an otherwise Arabic page.
    // Built from the same locale list as `rtl` above, so a locale cannot be
    // registered here and forgotten there. See i18n/vuetify-messages.ts.
    messages: VUETIFY_MESSAGES,
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
