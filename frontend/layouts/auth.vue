<script setup lang="ts">
/**
 * Pre-auth shell (SCRUM-43). Deliberately NOT the app shell: no sidebar, no user
 * menu, no nav. Just a centred card with the language switcher in the top corner,
 * because the user must be able to choose their language before signing in.
 *
 * The `dir` binding is belt-and-braces: plugins/rtl.client.ts already sets
 * <html dir>, but binding it here as well keeps the layout correct in isolation
 * (e.g. component tests) and makes the RTL intent obvious at the call site.
 */
const { locale } = useI18n()
const dir = computed(() => (locale.value === 'ar' ? 'rtl' : 'ltr'))
</script>

<template>
  <v-app>
    <div
      :dir="dir"
      class="flex min-h-screen flex-col bg-background"
    >
      <div class="flex justify-end p-4">
        <LanguageSwitcher />
      </div>

      <main class="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center">
        <div class="w-full max-w-md">
          <slot />
        </div>
      </main>
    </div>
  </v-app>
</template>
