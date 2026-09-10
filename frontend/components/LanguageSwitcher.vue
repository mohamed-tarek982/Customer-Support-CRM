<script setup lang="ts">
/**
 * One-tap language toggle between the two registered locales. Used on both the
 * app shell (layouts/default.vue) and the pre-auth shell (layouts/auth.vue),
 * since a user has to be able to pick their language before signing in.
 *
 * The label shows the OTHER language, in that language, so an Arabic speaker
 * sees "العربية" to switch to it.
 */
import { mdiTranslate } from '@mdi/js'
import { APP_LOCALES } from '~/i18n/locale-config'

const props = withDefaults(
  defineProps<{
    /**
     * Vuetify colour token for the button. The default suits a light surface
     * (the pre-auth shell); a dark chrome such as the app bar passes "white",
     * where primary-on-primary would be unreadable.
     */
    color?: string
  }>(),
  { color: 'primary' },
)

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
    :color="props.color"
    size="small"
    min-height="34"
    :aria-label="localeName"
    :prepend-icon="mdiTranslate"
    @click="toggleLocale"
  >
    {{ localeName }}
  </v-btn>
</template>
