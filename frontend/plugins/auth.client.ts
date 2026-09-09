/**
 * Rehydrates the session from localStorage before the app renders, so a hard
 * reload does not bounce an authenticated user back to /login. Client-only by
 * filename (`.client.ts`); ssr is off anyway.
 */
export default defineNuxtPlugin(() => {
  useAuth().hydrate()
})
