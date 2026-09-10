<script setup lang="ts">
/**
 * Staff workspace shell: sidebar + top bar, for agents and admins.
 *
 * The sidebar is built from the signed-in role, so an agent never sees the
 * admin-only entries (SCRUM-34). That is housekeeping, not a boundary — pair it
 * with the guard on the page itself:
 *   definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })
 */
import { staffNavFor } from '~/composables/useNavigation'

const auth = useAuth()

const navItems = computed(() => staffNavFor(auth.role.value))
</script>

<template>
  <AppShell
    :items="navItems"
    area-key="app.area.staff"
  >
    <slot />
  </AppShell>
</template>
