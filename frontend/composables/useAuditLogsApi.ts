/**
 * Typed client for the audit-trail API (SCRUM-35).
 *
 * A thin wrapper over `useApi()`, so it inherits the bearer token, the silent
 * 401 refresh and the redirect-to-login on refresh failure. Nothing here does
 * its own auth handling — one place owns that.
 *
 * There is only a read. The trail is written by the backend's global
 * `AuditLogInterceptor`, and nothing in the frontend may add, edit or delete a
 * row: an audit trail its subjects can rewrite is not one. The endpoint is
 * admin-only server-side; the page hides itself from a non-admin, but that is
 * convenience — REDIRECT IS NOT SECURITY, and a non-admin who calls this
 * directly gets a 403 from `RolesGuard`.
 */
import type { AuditLogRow } from '~/utils/audit-logs-form'

export interface PaginatedAuditLogs {
  items: AuditLogRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function useAuditLogsApi() {
  const api = useApi()

  return {
    list(query: Record<string, string | number> = {}): Promise<PaginatedAuditLogs> {
      return api<PaginatedAuditLogs>('/audit-logs', { query })
    },
  }
}
