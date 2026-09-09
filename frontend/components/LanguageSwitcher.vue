<script setup lang="ts">
/**
 * One-tap language toggle between the two registered locales. Used on both the
 * app shell (layouts/default.vue) and the pre-auth shell (layouts/auth.vue),
 * since a user has to be able to pick their language before signing in.
 *
 * The label shows the OTHER language, in that language, so an Arabic speaker
 * sees "العربية" to switch to it.
 */
import { APP_LOCALES } from '~/i18n/locale-config'

const { locale, setLocale } = useI18n()

const otherLocale = computed(() => (locale.value === 'ar' ? 'en' : 'ar'))

const localeName = computed(
  () => APP_LOCALES.find((entry) => entry.code === otherLocale.value)?.name ?? otherLocale.value,
)

async function toggleLocale(): Promise<void> {
  await setLocale(otherLocale.value)
}
</script>

<template>
  <v-btn
    variant="outlined"
    color="primary"
    size="small"
    :aria-label="localeName"
    @click="toggleLocale"
  >
    {{ localeName }}
  </v-btn>
</template>
