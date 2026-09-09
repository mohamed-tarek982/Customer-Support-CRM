<script setup lang="ts">
/**
 * Stand-in body for a section that has a route and a sidebar entry but no
 * screen yet (Phase 5: SCRUM-29/30/31).
 *
 * These pages exist now so the two shells can be navigated end to end and so
 * each route's guard and layout are already declared in one place. Replace the
 * placeholder with the real content when the screen lands — the page file, its
 * `definePageMeta`, and its nav entry all stay as they are.
 */
defineProps<{
  /** i18n key for the heading. Reuses the sidebar label so the two never drift. */
  titleKey: string
}>()
</script>

<template>
  <section class="flex flex-col gap-3">
    <h1 class="text-2xl font-semibold text-secondary">
      {{ $t(titleKey) }}
    </h1>
    <p class="max-w-2xl text-secondary/70">
      {{ $t('page.placeholder') }}
    </p>
  </section>
</template>
