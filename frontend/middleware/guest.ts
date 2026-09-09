/**
 * Keeps an already-authenticated user off the login / forgot / reset pages —
 * they have no reason to be there, and it would be confusing to let them sit on
 * a login form while logged in. Sends them to their type's home instead.
 *
 * Opt in: `definePageMeta({ middleware: ['guest'] })`.
 */
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  const userType = auth.userType.value
  if (auth.isAuthenticated.value && userType) {
    return navigateTo(homePathFor(userType))
  }
})
