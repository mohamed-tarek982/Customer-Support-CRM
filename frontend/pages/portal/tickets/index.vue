<script setup lang="ts">
/**
 * The customer's own tickets (SCRUM-30).
 *
 * Route + guard + layout only; the screen itself is Phase 5. See
 * components/PagePlaceholder.vue.
 */
definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
</script>

<template>
  <PagePlaceholder title-key="nav.client.myTickets" />
</template>
