<script setup lang="ts">
/**
 * RTL verification page for SCRUM-42.
 *
 * Manual smoke test: load this page, hit the language button, and confirm all
 * three readouts flip together. If <html dir> flips but Vuetify's isRtl does
 * not (or the reverse), you get a half-mirrored layout — Vuetify components
 * swapping sides inside a grid that did not. That failure is silent in English,
 * which is exactly why it needs a page of its own.
 */
import { useLocale } from 'vuetify'

const { locale, setLocale } = useI18n()

// Vuetify's own locale composable, so the readout below reflects what Vuetify
// actually believes rather than what we hope we set.
const vuetifyLocale = useLocale()

const documentDir = ref('ltr')

const isArabic = computed(() => locale.value === 'ar')
const vuetifyIsRtl = computed(() => vuetifyLocale.isRtl.value)

function readDocumentDir(): void {
  documentDir.value = document.documentElement.getAttribute('dir') ?? 'ltr'
}

async function toggle(): Promise<void> {
  await setLocale(isArabic.value ? 'en' : 'ar')
  await nextTick()
  readDocumentDir()
}

onMounted(readDocumentDir)
watch(locale, () => nextTick().then(readDocumentDir))
</script>

<template>
  <div class="flex flex-col gap-8">
    <section>
      <h1 class="mb-2 text-2xl font-semibold text-secondary">
        {{ $t('rtl.heading') }}
      </h1>
      <p class="max-w-2xl text-secondary/80">
        {{ $t('rtl.body') }}
      </p>
    </section>

    <div class="flex items-center gap-4">
      <v-btn
        color="primary"
        @click="toggle"
      >
        {{ isArabic ? $t('rtl.switchBack') : $t('rtl.switchTo') }}
      </v-btn>
    </div>

    <!-- The three readouts that must agree. -->
    <section class="grid gap-4 sm:grid-cols-3">
      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="text-sm text-secondary/70">
          {{ $t('rtl.locale') }}
        </p>
        <p class="text-lg font-semibold text-primary">
          {{ locale }}
        </p>
      </div>
      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="text-sm text-secondary/70">
          {{ $t('rtl.direction') }}
        </p>
        <p class="text-lg font-semibold text-primary">
          {{ documentDir }}
        </p>
      </div>
      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="text-sm text-secondary/70">
          {{ $t('rtl.vuetifyRtl') }}
        </p>
        <p class="text-lg font-semibold text-primary">
          {{ vuetifyIsRtl }}
        </p>
      </div>
    </section>

    <!-- A Vuetify card inside a Tailwind grid, spaced with logical utilities. -->
    <section class="grid grid-cols-1 gap-4 ps-4 pe-4 md:grid-cols-2">
      <v-card elevation="2">
        <v-card-item>
          <v-card-title>{{ $t('rtl.cardTitle') }}</v-card-title>
          <v-card-subtitle>{{ $t('rtl.cardSubtitle') }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>{{ $t('rtl.cardBody') }}</v-card-text>
        <v-card-actions>
          <v-btn
            color="primary"
            variant="text"
          >
            {{ $t('home.primaryAction') }}
          </v-btn>
          <v-btn
            color="secondary"
            variant="text"
          >
            {{ $t('home.secondaryAction') }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <div class="flex flex-col gap-4">
        <!-- ps- and pe- follow the reading direction. Their physical
             equivalents pl- and pr- are blocked by the lint rule. -->
        <div class="rounded-lg border-s-4 border-primary bg-surface py-3 ps-6">
          <p class="text-sm text-secondary">
            {{ $t('rtl.startSide') }}
          </p>
        </div>
        <div class="rounded-lg border-e-4 border-success bg-surface py-3 pe-6 text-end">
          <p class="text-sm text-secondary">
            {{ $t('rtl.endSide') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
