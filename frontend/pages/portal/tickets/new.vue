<script setup lang="ts">
/**
 * Customer ticket submission form (SCRUM-31).
 *
 * Route + guard + layout only; the screen itself is Phase 5. See
 * components/PagePlaceholder.vue.
 */
definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
</script>

<template>
  <PagePlaceholder title-key="nav.client.newTicket" />
</template>
