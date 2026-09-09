/**
 * Route guard for authenticated pages (SCRUM-43).
 *
 * REDIRECT IS NOT SECURITY. Because ssr is off, every line of this file ships to
 * the browser and can be bypassed. It exists for UX only: to send an
 * unauthenticated visitor to /login with a `redirect` back, and to keep a
 * customer out of staff screens (and vice versa). The real boundary is the
 * NestJS `JwtAuthGuard` + `UserTypeGuard` on every endpoint — a customer who
 * edits the URL still gets a 403 from the API.
 *
 * Opt in per page: `definePageMeta({ middleware: ['auth'], userTypes: ['staff'] })`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuth()

  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  const allowed = to.meta.userTypes
  const current = auth.userType.value
  if (allowed && current && !allowed.includes(current)) {
    return navigateTo(homePathFor(current))
  }
})
