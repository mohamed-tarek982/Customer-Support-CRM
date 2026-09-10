<script setup lang="ts">
definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })
</script>

<template>
  <section class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold text-secondary">
      {{ $t('staff.title') }}
    </h1>
    <p class="max-w-2xl text-sm text-secondary/70">
      {{ $t('staff.subtitle') }}
    </p>
  </section>
</template>
