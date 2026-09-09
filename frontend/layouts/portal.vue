<script setup lang="ts">
/**
 * Customer portal shell: the client-facing half of the app.
 *
 * Same chrome as the staff shell, different nav. Pair it with the guard on the
 * page itself — the layout is chrome, not a boundary:
 *   definePageMeta({ layout: 'portal', middleware: ['auth'], userTypes: ['customer'] })
 */
import { CLIENT_NAV } from '~/composables/useNavigation'
</script>

<template>
  <AppShell
    :items="[...CLIENT_NAV]"
    area-key="app.area.client"
  >
    <slot />
  </AppShell>
</template>
