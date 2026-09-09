<script setup lang="ts">
/**
 * Portal home (SCRUM-43). Customers land here after login. Real content is
 * Phase 5 (SCRUM-29/30/31); this exists so the type-aware redirect has a
 * destination and the `userTypes: ['customer']` guard has something to guard.
 *
 * The signed-in email and the sign-out button live in the portal shell's
 * sidebar now, so they are deliberately not repeated here.
 */
definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold text-secondary">
      {{ $t('portal.heading') }}
    </h1>
    <p class="max-w-2xl text-secondary/80">
      {{ $t('portal.body') }}
    </p>
  </div>
</template>
