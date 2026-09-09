/**
 * Authenticated API client (SCRUM-43).
 *
 * A `$fetch` instance pinned to `runtimeConfig.public.apiBase` that:
 *   - injects `Authorization: Bearer <accessToken>` from the current session,
 *   - on a 401, attempts a single silent `POST /auth/refresh` (serialised across
 *     concurrent calls by `useAuth().refresh()`), then retries the request once,
 *   - on refresh failure, clears the session and sends the user to /login.
 *
 * Login / refresh / logout themselves are NOT routed through here — they live in
 * useAuth() and hit the API directly, so there is no retry recursion.
 */
export function useApi() {
  const config = useRuntimeConfig()
  const auth = useAuth()

  const client = $fetch.create({
    baseURL: config.public.apiBase as string,
    onRequest({ options }) {
      const token = auth.session.value?.accessToken
      if (!token) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      headers.set('Authorization', `Bearer ${token}`)
      options.headers = headers
    },
  })

  return async function api<T>(
    request: Parameters<typeof client>[0],
    options: Parameters<typeof client>[1] & { _retried?: boolean } = {},
  ): Promise<T> {
    try {
      return await client<T>(request, options)
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 401 && !options._retried) {
        const refreshed = await auth.refresh()
        if (refreshed) {
          return api<T>(request, { ...options, _retried: true })
        }
        await auth.logout({ silent: true })
        await navigateTo('/login')
      }
      throw error
    }
  }
}
