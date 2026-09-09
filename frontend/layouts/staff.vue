<script setup lang="ts">
/**
 * Staff workspace shell: sidebar + top bar, for agents and admins.
 *
 * Pair it with the guard on the page itself — the layout is chrome, not a
 * boundary:
 *   definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })
 */
import { STAFF_NAV } from '~/composables/useNavigation'
</script>

<template>
  <AppShell
    :items="[...STAFF_NAV]"
    area-key="app.area.staff"
  >
    <slot />
  </AppShell>
</template>
