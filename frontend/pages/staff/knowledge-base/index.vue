<script setup lang="ts">
/**
 * Staff-side knowledge base authoring (SCRUM-23).
 *
 * Route + guard + layout only; the screen itself is Phase 5. See
 * components/PagePlaceholder.vue.
 */
definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })
</script>

<template>
  <PagePlaceholder title-key="nav.staff.knowledgeBase" />
</template>
