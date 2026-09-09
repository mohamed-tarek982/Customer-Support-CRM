<script setup lang="ts">
/**
 * LINT FIXTURE — THIS FILE IS SUPPOSED TO FAIL LINTING.
 *
 * It exists so the logical-property rule can be proven to work rather than
 * assumed to. `scripts/verify-lint-rule.sh` lints this file on its own and
 * fails the build if ESLint reports no error.
 *
 * It is excluded from the normal lint pass via the `ignores` entry in
 * eslint.config.mjs, so `pnpm lint` stays green.
 *
 * Do not "fix" the classes below.
 */
const label = 'pl-4 physical padding in a script string'
</script>

<template>
  <div class="flex items-center gap-4">
    <!-- Physical padding: must be flagged. Should be ps-4. -->
    <div class="pl-4">{{ label }}</div>

    <!-- Physical margin: must be flagged. Should be me-2. -->
    <div class="mr-2">margin right</div>

    <!-- Physical text alignment: must be flagged. Should be text-start. -->
    <div class="text-left">aligned left</div>

    <!-- Vuetify utility classes: must be flagged. Should be p-4 / flex. -->
    <div class="pa-4 d-flex">vuetify utilities</div>
  </div>
</template>
