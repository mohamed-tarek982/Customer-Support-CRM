<script setup lang="ts">
/**
 * The sidebar's icon set, as inline SVG.
 *
 * No icon font ships with this app (see package.json — there is no @mdi/font),
 * so Vuetify's default `mdi-*` names would render as empty boxes. These are
 * plain 24x24 stroke paths instead: no dependency, they inherit `currentColor`,
 * and they scale with whatever Tailwind size class the caller passes.
 *
 * Icons are decorative here — every nav item has a visible text label — so they
 * are hidden from assistive tech.
 */
export type IconName =
  | 'dashboard'
  | 'ticket'
  | 'users'
  | 'book'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'user'
  | 'menu'
  | 'shield'
  | 'history'

const props = defineProps<{ name: IconName }>()

/** Single `d` attribute per icon, drawn on a 24x24 grid. */
const PATHS: Record<IconName, string> = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  ticket: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V8Zm10-2v12',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm9 12v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75',
  book: 'M5 5a2 2 0 0 1 2-2h11v14H7a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 0 2 2h11',
  chart: 'M5 20V10m7 10V4m7 16v-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.1-1.2L14.5 3h-4l-.4 2.6c-.8.3-1.5.7-2.1 1.2l-2.3-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2.1 1.2l.4 2.6h4l.4-2.6c.8-.3 1.5-.7 2.1-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z',
  plus: 'M12 5v14M5 12h14',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  shield: 'M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Zm0 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-3.5 8a3.5 3.5 0 0 1 7 0',
  // A plain clock face: direction-neutral, so it needs no RTL mirroring the
  // way a rewind arrow would.
  history: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-13v5l3.5 2',
}

const path = computed(() => PATHS[props.name])
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>
