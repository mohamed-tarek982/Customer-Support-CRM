import { APP_LOCALES, DEFAULT_LOCALE } from './i18n/locale-config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  /**
   * SPA mode. Chosen deliberately: this is an authenticated internal CRM, so
   * server rendering buys nothing and costs a Node server.
   *
   * PHASE 5 NOTE (SCRUM-23): ssr: false makes public knowledge-base and FAQ
   * pages non-crawlable. Nuxt supports per-route rendering, so if SEO is needed
   * for the public portal, opt those routes in with routeRules rather than
   * flipping ssr globally, e.g.
   *   routeRules: { '/kb/**': { prerender: true } }
   */
  ssr: false,

  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/i18n', '@vee-validate/nuxt'],

  css: [
    // Vuetify's own stylesheet MUST load — its components do not function
    // without it. This is the half of the boundary that Tailwind never touches.
    'vuetify/styles',
    '~/assets/css/tailwind.css',
  ],

  build: {
    transpile: ['vuetify'],
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: DEFAULT_LOCALE,
    langDir: 'locales',
    // Registered from i18n/locale-config.ts, which plugins/vuetify.ts and
    // plugins/rtl.client.ts read from too, so the direction cannot drift.
    locales: APP_LOCALES,
    // The locale is an explicit user choice in this app, not a guess from the
    // browser, so a support agent's session language never changes underfoot.
    detectBrowserLanguage: false,
    bundle: {
      // Set explicitly because the module warns when it is left to default.
      // It is slated for deprecation in i18n v10 and is known to cause issues.
      optimizeTranslationDirective: false,
    },
  },

  veeValidate: {
    autoImports: true,
    componentNames: {
      Form: 'VeeForm',
      Field: 'VeeField',
      FieldArray: 'VeeFieldArray',
      ErrorMessage: 'VeeErrorMessage',
    },
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001/api/v1',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  vite: {
    define: { 'process.env.DEBUG': 'false' },
    // Vuetify ships ESM that Vite pre-bundles poorly in dev unless excluded.
    optimizeDeps: { exclude: ['vuetify'] },
  },
})
