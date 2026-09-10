/**
 * Typed client for the admin user-management API (SCRUM-34).
 *
 * A thin wrapper over `useApi()`, so it inherits the bearer token, the silent
 * 401 refresh and the redirect-to-login on refresh failure. Nothing here does
 * its own auth handling — one place owns that.
 *
 * Every endpoint below is admin-only server-side. The page hides its controls
 * from a non-admin, but that is convenience: REDIRECT IS NOT SECURITY, and a
 * non-admin who calls these directly gets a 403 from `RolesGuard`.
 */
import type { CreateUserForm, UpdateUserForm, UserRole, UserRow } from '~/utils/users-form'

export interface PaginatedUsers {
  items: UserRow[]
  total: number
  page: number
  pageSize: number
}

export function useUsersApi() {
  const api = useApi()

  return {
    list(query: Record<string, string | number | boolean> = {}): Promise<PaginatedUsers> {
      return api<PaginatedUsers>('/users', { query })
    },

    get(id: string): Promise<UserRow> {
      return api<UserRow>(`/users/${id}`)
    },

    create(body: CreateUserForm): Promise<UserRow> {
      return api<UserRow>('/users', { method: 'POST', body })
    },

    /**
     * Takes a partial body on purpose: the page sends only the fields that
     * changed, so a concurrent edit to an untouched field is not clobbered.
     */
    update(id: string, body: Partial<UpdateUserForm>): Promise<UserRow> {
      return api<UserRow>(`/users/${id}`, { method: 'PATCH', body })
    },

    deactivate(id: string): Promise<UserRow> {
      return api<UserRow>(`/users/${id}/deactivate`, { method: 'POST' })
    },

    reactivate(id: string): Promise<UserRow> {
      return api<UserRow>(`/users/${id}/reactivate`, { method: 'POST' })
    },

    assignRole(id: string, role: UserRole): Promise<UserRow> {
      return api<UserRow>(`/users/${id}/role`, { method: 'POST', body: { role } })
    },
  }
}
