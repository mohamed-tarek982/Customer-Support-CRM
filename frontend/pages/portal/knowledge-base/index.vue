<script setup lang="ts">
/**
 * Customer-facing help centre (SCRUM-23).
 *
 * Route + guard + layout only; the screen itself is Phase 5. See
 * components/PagePlaceholder.vue.
 */
definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
</script>

<template>
  <PagePlaceholder title-key="nav.client.knowledgeBase" />
</template>
