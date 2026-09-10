<script setup lang="ts">
/**
 * The authenticated app shell: sidebar + top bar + content slot.
 *
 * Both authenticated layouts (staff and portal) are thin wrappers around this,
 * so the two audiences share one chrome and differ only in their nav items.
 * A page never renders this directly — it picks a layout.
 *
 * Direction: the drawer is `location="start"`, not "left", so it sits on the
 * right in Arabic. Every class on a non-Vuetify element is Tailwind and every
 * inline direction is logical (ps-/pe-/ms-/me-), per the project styling rules.
 *
 * Icons are inline SVG on purpose: no icon font is installed, so `mdi-*` names
 * would render as empty boxes. The one exception is the sign-out glyph, which
 * comes from @mdi/js as a path constant — the shape Vuetify's mdi-svg set
 * expects (see plugins/vuetify.ts).
 */
import { mdiLogout } from '@mdi/js'
import type { NavItem } from '~/composables/useNavigation'
import { directionFor } from '~/i18n/locale-config'

const props = defineProps<{
  /** Sidebar entries, in display order. */
  items: NavItem[]
  /** i18n key for the small label under the app title (e.g. "Staff workspace"). */
  areaKey: string
}>()

const auth = useAuth()
const route = useRoute()
const { t, locale } = useI18n()

/**
 * Open by default on desktop, closed on mobile — Vuetify's `mobile-breakpoint`
 * handling flips the drawer to a temporary overlay below `md` on its own, and
 * the hamburger in the app bar is the only way back once it is dismissed.
 */
const drawerOpen = ref(true)

/**
 * The sign-out glyph is an arrow leaving a door, so it points the wrong way in
 * Arabic. Direction comes from the locale config, never from a hardcoded 'rtl'.
 */
const isRtl = computed(() => directionFor(locale.value) === 'rtl')

const logoutIconStyle = computed(() => (isRtl.value ? { transform: 'scaleX(-1)' } : undefined))

/**
 * Exact match for section index routes ("/staff", "/portal"), prefix match for the rest.
 * Without the exact flag, "/" would light up on every staff page.
 */
function isActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const currentTitle = computed(() => {
  const match = props.items.find((item) => isActive(item))
  return match ? t(match.labelKey) : t('app.title')
})
</script>

<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawerOpen"
      location="start"
      :width="260"
      class="border-e border-gray-200 bg-blue-grey-darken-3 flex flex-col"
    >
      <div class="flex h-full flex-col">
        <div class="border-b border-secondary/15 px-4 py-4">
          <p class="text-base font-semibold text-white">
            {{ $t('app.title') }}
          </p>
          <p class="text-xs text-white/60">
            {{ $t(areaKey) }}
          </p>
        </div>

        <nav
          class="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
          :aria-label="$t('nav.primary')"
        >
          <NuxtLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            class="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            :class="
              isActive(item)
                ? 'bg-gray-200 text-primary'
                : 'text-white hover:bg-blue-grey-lighten-2 hover:text-secondary'
            "
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            <AppNavIcon
              :name="item.icon"
              class="h-5 w-5 shrink-0"
            />
            <span class="truncate">{{ $t(item.labelKey) }}</span>
          </NuxtLink>
        </nav>

        <!--
          The signed-in identity and its sign-out. The app bar carries the same
          action for a narrow viewport, where this drawer is a dismissed overlay
          — so below `md` the two are never on screen at once.
        -->
        <div class="border-t border-secondary/15 p-3">
          <p class="truncate px-1 pb-2 text-xs text-white/60">
            {{ auth.session.value?.email }}
          </p>
          <v-btn
            block
            variant="outlined"
            color="error"
            size="small"
            min-height="32"
            @click="auth.logout()"
          >
            <v-icon
              :icon="mdiLogout"
              :style="logoutIconStyle"
            />
            <span class="ms-2">{{ $t('auth.logout.button') }}</span>
          </v-btn>
        </div>
      </div>
    </v-navigation-drawer>

    <v-app-bar
      flat
      color="primary"
      :height="60"
    >
      <div class="flex w-full items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <!--
          No `color` on purpose: the bar paints its own contrast text colour and
          the icon inherits it, so the hamburger stays legible if the primary
          token changes.
        -->
        <v-btn
          variant="text"
          icon
          :aria-label="$t('nav.toggleMenu')"
          @click="drawerOpen = !drawerOpen"
        >
          <AppNavIcon
            name="menu"
            class="h-5 w-5"
          />
        </v-btn>
        <h1 class="me-auto truncate text-base font-semibold text-white">
          {{ currentTitle }}
        </h1>
        <LanguageSwitcher color="white" />
        <!--
          Destructive, so it carries the error token as a solid fill — the one
          red thing in the chrome. The label collapses to the icon below `sm`,
          where the title needs the room; the aria-label carries it either way.
        -->
        <v-btn
          variant="flat"
          color="error"
          size="small"
          min-height="35"
          :aria-label="$t('auth.logout.button')"
          @click="auth.logout()"
        >
          <v-icon
            :icon="mdiLogout"
            :style="logoutIconStyle"
          />
          <span class="ms-2 hidden sm:inline">{{ $t('auth.logout.button') }}</span>
        </v-btn>
      </div>
    </v-app-bar>

    <v-main class="bg-background">
      <div class="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <slot />
      </div>
    </v-main>
  </v-app>
</template>
