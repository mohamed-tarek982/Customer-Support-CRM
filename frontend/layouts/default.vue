<script setup lang="ts">
/**
 * Application shell.
 *
 * Every class on a non-Vuetify element here is Tailwind, and every inline
 * direction is logical (ps-/pe-/ms-/me-), so the whole shell mirrors when the
 * locale switches to Arabic. Vuetify utility classes (pa-*, d-flex, text-center)
 * are banned project-wide and the lint rule will reject them.
 */
const auth = useAuth()
</script>

<template>
  <v-app>
    <div class="min-h-screen bg-background">
      <header class="border-b border-secondary/20 bg-surface">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
          <div class="me-auto">
            <p class="text-lg font-semibold text-secondary">
              {{ $t('app.title') }}
            </p>
            <p class="text-sm text-secondary/70">
              {{ $t('app.tagline') }}
            </p>
          </div>

          <nav class="flex items-center gap-2">
            <NuxtLink
              to="/"
              class="rounded px-3 py-2 text-sm font-medium text-secondary hover:bg-background"
            >
              {{ $t('nav.home') }}
            </NuxtLink>
            <NuxtLink
              to="/rtl-demo"
              class="rounded px-3 py-2 text-sm font-medium text-secondary hover:bg-background"
            >
              {{ $t('nav.rtlDemo') }}
            </NuxtLink>
          </nav>

          <LanguageSwitcher />

          <v-btn
            v-if="auth.isAuthenticated.value"
            variant="text"
            color="secondary"
            size="small"
            @click="auth.logout()"
          >
            {{ $t('auth.logout.button') }}
          </v-btn>
        </div>
      </header>

      <main class="mx-auto max-w-5xl px-6 py-8">
        <slot />
      </main>
    </div>
  </v-app>
</template>
