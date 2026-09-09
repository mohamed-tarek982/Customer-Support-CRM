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
 * would render as empty boxes.
 */
import type { NavItem } from '~/composables/useNavigation'

const props = defineProps<{
  /** Sidebar entries, in display order. */
  items: NavItem[]
  /** i18n key for the small label under the app title (e.g. "Staff workspace"). */
  areaKey: string
}>()

const auth = useAuth()
const route = useRoute()
const { t } = useI18n()

/**
 * Open by default on desktop, closed on mobile — Vuetify's `mobile-breakpoint`
 * handling flips the drawer to a temporary overlay below `md` on its own, and
 * the hamburger in the app bar is the only way back once it is dismissed.
 */
const drawerOpen = ref(true)

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
      color="surface"
      :width="260"
    >
      <div class="flex h-full flex-col">
        <div class="border-b border-secondary/15 px-4 py-4">
          <p class="text-base font-semibold text-secondary">
            {{ $t('app.title') }}
          </p>
          <p class="text-xs text-secondary/60">
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
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            :class="
              isActive(item)
                ? 'bg-primary/10 text-primary'
                : 'text-secondary hover:bg-background hover:text-secondary'
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

        <div class="border-t border-secondary/15 p-3">
          <p class="truncate px-1 pb-2 text-xs text-secondary/60">
            {{ auth.session.value?.email }}
          </p>
          <v-btn
            block
            variant="outlined"
            color="secondary"
            size="small"
            @click="auth.logout()"
          >
            {{ $t('auth.logout.button') }}
          </v-btn>
        </div>
      </div>
    </v-navigation-drawer>

    <v-app-bar
      flat
      color="surface"
      :height="60"
    >
      <div class="flex w-full items-center gap-3 px-4">
        <v-btn
          variant="text"
          color="secondary"
          icon
          :aria-label="$t('nav.toggleMenu')"
          @click="drawerOpen = !drawerOpen"
        >
          <AppNavIcon
            name="menu"
            class="h-5 w-5"
          />
        </v-btn>
        <h1 class="me-auto truncate text-base font-semibold text-secondary">
          {{ currentTitle }}
        </h1>
        <LanguageSwitcher />
      </div>
    </v-app-bar>

    <v-main class="bg-background">
      <div class="mx-auto max-w-6xl px-6 py-6">
        <slot />
      </div>
    </v-main>
  </v-app>
</template>
