/**
 * Client-side session store and the thin API wrappers the auth pages call.
 *
 * ssr: false, so this only ever runs in the browser. The session lives in Nuxt
 * `useState` (in-memory, survives navigation) and is mirrored to `localStorage`
 * so a hard reload can rehydrate it. Every localStorage access is guarded: a
 * private window or a browser with site data blocked throws on read/write, and
 * the app must still work — it just falls back to a single-tab session.
 *
 * REDIRECT IS NOT SECURITY. Nothing here is a boundary; the NestJS guards are.
 */

export type UserType = 'staff' | 'customer'

export interface Session {
  accessToken: string
  refreshToken: string
  userType: UserType
  role: string
  email: string
  sub: string
  /** Access-token `exp`, in seconds since the epoch. Drives the silent refresh. */
  exp: number
}

interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface LoginResponse extends TokenPair {
  user: { sub: string; email: string; role: string; userType: UserType }
}

const STORAGE_KEY = 'auth.session'

/** Fire the silent refresh this many ms before the access token actually expires. */
const REFRESH_SKEW_MS = 30_000

/** Decode a JWT payload without a dependency. Returns `{}` for anything malformed. */
export function decodeJwt(token: string): Record<string, unknown> {
  const segment = token.split('.')[1]
  if (!segment) return {}
  try {
    const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Build a Session from a token pair, reading `exp` off the access token. */
export function sessionFromTokens(
  tokens: TokenPair,
  fallback: { userType: UserType; role: string; email: string; sub: string },
): Session {
  const claims = decodeJwt(tokens.accessToken)
  return {
    ...tokens,
    userType: (claims.userType as UserType) ?? fallback.userType,
    role: (claims.role as string) ?? fallback.role,
    email: (claims.email as string) ?? fallback.email,
    sub: (claims.sub as string) ?? fallback.sub,
    exp: typeof claims.exp === 'number' ? claims.exp : 0,
  }
}

/** ms from now until the silent refresh should fire. Never negative. */
export function refreshDelayMs(exp: number, now = Date.now()): number {
  return Math.max(0, exp * 1000 - now - REFRESH_SKEW_MS)
}

// Module-scoped (shared across the SPA): the in-flight refresh promise serialises
// concurrent 401s, and the timer handle lets a new schedule cancel the old one.
let refreshPromise: Promise<boolean> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export function useAuth() {
  const config = useRuntimeConfig()
  const session = useState<Session | null>('auth.session', () => null)

  const apiBase = config.public.apiBase as string

  function readStored(): Session | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  }

  function persist(value: Session | null): void {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable — the in-memory session still works for this tab.
    }
  }

  function setSession(value: Session | null): void {
    session.value = value
    persist(value)
    scheduleRefresh()
  }

  function scheduleRefresh(): void {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    if (!import.meta.client || !session.value) return
    refreshTimer = setTimeout(() => {
      void refresh()
    }, refreshDelayMs(session.value.exp))
  }

  /** Rehydrate from localStorage on plugin init. */
  function hydrate(): void {
    const stored = readStored()
    if (stored) {
      session.value = stored
      scheduleRefresh()
    }
  }

  async function login(email: string, password: string): Promise<Session> {
    const data = await $fetch<LoginResponse>('/auth/login', {
      baseURL: apiBase,
      method: 'POST',
      body: { email, password },
    })
    const next = sessionFromTokens(data, {
      userType: data.user.userType,
      role: data.user.role,
      email: data.user.email,
      sub: data.user.sub,
    })
    setSession(next)
    return next
  }

  function refresh(): Promise<boolean> {
    if (refreshPromise) return refreshPromise
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
    return refreshPromise
  }

  async function doRefresh(): Promise<boolean> {
    const current = session.value
    if (!current) return false
    try {
      const data = await $fetch<TokenPair>('/auth/refresh', {
        baseURL: apiBase,
        method: 'POST',
        body: { refreshToken: current.refreshToken },
      })
      setSession(
        sessionFromTokens(data, {
          userType: current.userType,
          role: current.role,
          email: current.email,
          sub: current.sub,
        }),
      )
      return true
    } catch {
      setSession(null)
      return false
    }
  }

  async function logout(options: { silent?: boolean } = {}): Promise<void> {
    const current = session.value
    if (current) {
      try {
        await $fetch('/auth/logout', {
          baseURL: apiBase,
          method: 'POST',
          body: { refreshToken: current.refreshToken },
        })
      } catch {
        // Best effort: the server row may already be gone. Clear locally regardless.
      }
    }
    setSession(null)
    if (!options.silent) {
      await navigateTo('/login')
    }
  }

  async function forgot(email: string): Promise<void> {
    await $fetch('/auth/forgot-password', {
      baseURL: apiBase,
      method: 'POST',
      body: { email },
    })
  }

  async function reset(token: string, newPassword: string): Promise<void> {
    await $fetch('/auth/reset-password', {
      baseURL: apiBase,
      method: 'POST',
      body: { token, newPassword },
    })
  }

  return {
    session,
    isAuthenticated: computed(() => session.value !== null),
    userType: computed(() => session.value?.userType ?? null),
    role: computed(() => session.value?.role ?? ''),
    hydrate,
    login,
    logout,
    refresh,
    forgot,
    reset,
  }
}
