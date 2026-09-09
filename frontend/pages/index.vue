<script setup lang="ts">
/**
 * Dispatcher. "/" belongs to neither audience now that staff live under
 * pages/staff/ and customers under pages/portal/ — it just forwards each user
 * to their own section's home.
 *
 * The `auth` middleware runs first and bounces anyone signed out to /login, so
 * by the time this page's middleware runs there is always a userType.
 *
 * No `userTypes` in the meta on purpose: both types are allowed here, they are
 * simply not allowed to stay.
 */
definePageMeta({
  layout: false,
  middleware: [
    'auth',
    () => {
      const auth = useAuth()
      const target = auth.userType.value ? homePathFor(auth.userType.value) : '/login'
      return navigateTo(target, { replace: true })
    },
  ],
})
</script>

<template>
  <div />
</template>
