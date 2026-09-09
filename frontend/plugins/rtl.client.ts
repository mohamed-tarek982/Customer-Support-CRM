import type { Composer } from 'vue-i18n'
import { applyDocumentDirection } from '~/i18n/locale-config'
import { vuetify } from './vuetify'

/**
 * Keeps the two direction systems in step.
 *
 * Vuetify mirrors its own components from `vuetify.locale.isRtl`. Tailwind's
 * logical utilities (ps-, pe-, ms-, me-, text-start, text-end) mirror from the
 * `dir` attribute on <html>. If only one of them flips you get a half-mirrored
 * page: Vuetify components swap sides while the grid around them does not, and
 * nothing errors — it just looks wrong to Arabic readers.
 *
 * So this always sets BOTH. Verify manually on /rtl-demo, where the three
 * readouts must agree.
 */
export default defineNuxtPlugin({
  name: 'rtl',
  dependsOn: ['vuetify'],

  setup(nuxtApp) {
    // Nuxt deliberately omits plugin-provided injections from NuxtApp while
    // typechecking plugins, to avoid a circular type. $i18n really is a vue-i18n
    // Composer at runtime, so name that type rather than reaching for `any`.
    const i18n = nuxtApp.$i18n as Composer

    function applyDirection(code: string): void {
      // Tailwind logical properties read the <html dir> attribute.
      applyDocumentDirection(document, code)

      // Vuetify reads this. Setting `current` recomputes isRtl from the rtl map
      // that plugins/vuetify.ts built out of the same locale config.
      vuetify.locale.current.value = code
    }

    watch(i18n.locale, applyDirection, { immediate: true })
  },
})
