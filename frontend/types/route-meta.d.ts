import type { UserType } from '~/composables/useAuth'

/**
 * `definePageMeta({ userTypes: [...] })` is read by middleware/auth.ts to keep
 * staff and customers on their own routes. Declared here so `to.meta.userTypes`
 * is typed rather than `unknown`.
 */
declare module 'vue-router' {
  interface RouteMeta {
    userTypes?: UserType[]
  }
}

export {}
