<script setup lang="ts">
/**
 * Customer profile and contact details.
 *
 * Route + guard + layout only; the screen itself is Phase 5. See
 * components/PagePlaceholder.vue.
 */
definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
</script>

<template>
  <PagePlaceholder title-key="nav.client.profile" />
</template>
