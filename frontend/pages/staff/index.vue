<script setup lang="ts">
/**
 * Coexistence sample page for SCRUM-42.
 *
 * Proves three things at once:
 *   - file-based routing (this file becomes "/staff" with no router config)
 *   - auto-imports (useFoo and useFormattedDate are used with no import line)
 *   - Vuetify components rendering correctly inside a Tailwind layout, with
 *     Preflight disabled so the button keeps its own base styles
 */
/**
 * SCRUM-42 coexistence sample, now the staff dashboard at /staff (SCRUM-43):
 * behind the `auth` middleware and restricted to `userTypes: ['staff']`. A
 * customer who reaches this URL is sent to /portal by that guard — which is UX,
 * not security. The API is the boundary.
 */
definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })

const foo = useFoo()
const { formatDate } = useFormattedDate()
const config = useRuntimeConfig()
const route = useRoute()
</script>

<template>
  <div class="flex flex-col gap-8">
    <section>
      <h1 class="mb-2 text-2xl font-semibold text-secondary">
        {{ $t('home.heading') }}
      </h1>
      <p class="max-w-2xl text-secondary/80">
        {{ $t('home.body') }}
      </p>
    </section>

    <!-- Vuetify components inside a Tailwind flex container. The container is
         Tailwind's job; the buttons style themselves through Vuetify props. -->
    <section class="flex items-center gap-4 rounded-lg bg-surface ps-4 pe-4 py-4 shadow-sm">
      <v-btn color="primary">
        {{ $t('home.primaryAction') }}
      </v-btn>
      <v-btn
        color="secondary"
        variant="tonal"
      >
        {{ $t('home.secondaryAction') }}
      </v-btn>
      <v-chip
        color="success"
        variant="flat"
      >
        {{ formatDate(Date.now()) }}
      </v-chip>
    </section>

    <section class="grid gap-4 md:grid-cols-3">
      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="mb-1 text-sm font-semibold text-secondary">
          {{ $t('home.autoImport') }}
        </p>
        <p class="text-sm text-secondary/80">
          {{ foo.message }}
        </p>
      </div>

      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="mb-1 text-sm font-semibold text-secondary">
          {{ $t('home.routing') }}
        </p>
        <p class="text-sm text-secondary/80">
          pages/staff/index.vue resolved to <code class="text-primary">{{ route.path }}</code>
        </p>
      </div>

      <div class="rounded-lg bg-surface p-4 shadow-sm">
        <p class="mb-1 text-sm font-semibold text-secondary">
          {{ $t('home.apiBase') }}
        </p>
        <p class="break-all text-sm text-secondary/80">
          {{ config.public.apiBase }}
        </p>
      </div>
    </section>
  </div>
</template>
