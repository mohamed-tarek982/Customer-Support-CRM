/**
 * Audit-log page logic, kept out of the SFC so it can be unit-tested without
 * mounting a Nuxt page (same split as utils/users-form.ts and settings-form.ts).
 */

/**
 * The role that may read the audit trail. Mirrors `@Roles('admin')` on the API.
 *
 * Deliberately not exported: `utils/users-form.ts` already exports an
 * `ADMIN_ROLE`, and Nuxt auto-imports every util into one namespace, so a second
 * one would shadow it somewhere unrelated. Callers ask `canReadAuditLogs`.
 */
const ADMIN_ROLE = 'admin'

/**
 * Mirrors the API's `AuditLogResponse`.
 *
 * `actorUserId` is a plain string, not a user object: the column is nullable and
 * carries no foreign key, so a row outlives the account it names. That is the
 * point of an audit trail, and it is why the backend returns the raw id.
 */
export interface AuditLogRow {
  id: string
  actorUserId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  branchId: string | null
  departmentId: string | null
  statusCode: number | null
  metadata: unknown
  createdAt: string
}

export interface AuditLogFilters {
  actorUserId: string
  action: string
  resourceType: string
  resourceId: string
  q: string
  /** `yyyy-MM-dd`, as a native date input produces it. */
  from: string
  to: string
}

export const AUDIT_LOG_FILTER_DEFAULTS: AuditLogFilters = {
  actorUserId: '',
  action: '',
  resourceType: '',
  resourceId: '',
  q: '',
  from: '',
  to: '',
}

/** Only an admin may reach the page. UX only — `@Roles('admin')` on the API is
 * the boundary, and a non-admin who types the URL still gets a 403 from it. */
export function canReadAuditLogs(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE
}

/**
 * Turn a `yyyy-MM-dd` date input into the ISO instant the API filters on.
 *
 * The upper bound takes the last millisecond of the day rather than midnight.
 * Both API bounds are inclusive, so a plain midnight `to` would silently exclude
 * everything that happened on the day the admin picked — and "show me what
 * happened today" returning nothing is the failure this page most has to avoid.
 *
 * Returns null for an empty or unparseable value, which drops the filter instead
 * of sending `Invalid Date` to the API as a 400.
 */
export function toIsoBound(value: string, edge: 'start' | 'end'): string | null {
  if (!value.trim()) return null

  const parsed = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Whether the admin has narrowed the trail at all.
 *
 * Drives the "clear filters" button and picks between the two empty states: an
 * empty trail and a filter that matched nothing look identical on screen and
 * need very different copy.
 */
export function hasActiveFilters(filters: AuditLogFilters): boolean {
  return Object.values(filters).some((value) => value.trim() !== '')
}

/**
 * Build the query string for the list request, dropping empty filters.
 *
 * Every value is trimmed first: a filter that is only whitespace is not a
 * filter, and sending one would return an empty trail that reads as "nobody did
 * anything".
 */
export function toAuditLogListQuery(
  filters: AuditLogFilters,
  page = 1,
  pageSize = 25,
): Record<string, string | number> {
  const query: Record<string, string | number> = { page, pageSize }

  const from = toIsoBound(filters.from, 'start')
  const to = toIsoBound(filters.to, 'end')

  if (filters.actorUserId.trim()) query.actorUserId = filters.actorUserId.trim()
  if (filters.action.trim()) query.action = filters.action.trim()
  if (filters.resourceType.trim()) query.resourceType = filters.resourceType.trim()
  if (filters.resourceId.trim()) query.resourceId = filters.resourceId.trim()
  if (filters.q.trim()) query.q = filters.q.trim()
  if (from) query.from = from
  if (to) query.to = to

  return query
}

/**
 * Whether the two date filters describe a range the API would refuse.
 *
 * Mirrors the service's `INVALID_DATE_RANGE` check so the page can say so under
 * the field instead of firing a request that comes back 400. The API still
 * enforces it — this only spares the admin the round trip.
 */
export function isInvalidRange(filters: AuditLogFilters): boolean {
  const from = toIsoBound(filters.from, 'start')
  const to = toIsoBound(filters.to, 'end')

  return Boolean(from && to && new Date(from).getTime() > new Date(to).getTime())
}

/**
 * Render `metadata` for the expanded row.
 *
 * The interceptor replaces an oversized body with the literal string
 * `[TRUNCATED]`, so a string is shown as-is — running `JSON.stringify` over it
 * would wrap it in quotes and imply it was the recorded value rather than a
 * marker. Anything else is pretty-printed, and an unserialisable value falls
 * back to its own text rather than throwing inside a template.
 */
export function formatMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return ''
  if (typeof metadata === 'string') return metadata

  try {
    return JSON.stringify(metadata, null, 2)
  } catch {
    return String(metadata)
  }
}

/** Whether a row has anything to expand, so the page can hide a toggle that
 * would open an empty panel. */
export function hasMetadata(row: AuditLogRow): boolean {
  return formatMetadata(row.metadata).trim() !== ''
}

/**
 * The HTTP verb the action starts with, or null when it does not start with one.
 *
 * The interceptor writes `"POST /api/v1/users"`, so splitting the verb off lets
 * the table show it as a chip and keeps the path readable next to it. A row
 * written in some other shape falls back to rendering the whole string.
 */
const HTTP_VERBS = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET'] as const

export function actionVerb(action: string): string | null {
  const [first] = action.split(' ')
  return first && (HTTP_VERBS as readonly string[]).includes(first) ? first : null
}

export function actionPath(action: string): string {
  const verb = actionVerb(action)
  return verb ? action.slice(verb.length).trim() : action
}

/** Vuetify chip colour for the verb, so a destructive row is visible while
 * scanning. Colours come from the theme names, never from a hex. */
export function verbColor(verb: string | null): string {
  if (verb === 'DELETE') return 'error'
  if (verb === 'POST') return 'success'
  if (verb === 'PUT' || verb === 'PATCH') return 'warning'
  return 'secondary'
}

/**
 * Map a failed request to the i18n key the page should show.
 *
 * Same contract as `userErrorKey`: the API answers a refusal with a
 * machine-readable code so this function can pick localized copy, and an
 * unrecognised code falls back to the generic message rather than rendering the
 * raw code at the admin.
 */
const ERROR_KEYS: Record<string, string> = {
  INVALID_DATE_RANGE: 'auditLogs.errors.invalidDateRange',
}

export function auditLogErrorKey(err: unknown): string {
  const code = errorCodeOf(err)
  if (code && ERROR_KEYS[code]) return ERROR_KEYS[code]

  const status = auditLogErrorStatus(err)
  if (status === 403) return 'auditLogs.errors.forbidden'
  if (status === 400) return 'auditLogs.errors.validation'
  if (status === undefined) return 'auditLogs.errors.network'
  return 'auditLogs.errors.generic'
}

/** Pull the HTTP status off an ofetch FetchError. Undefined when the request
 * never got a response at all (offline, DNS, CORS, connection refused). */
export function auditLogErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  for (const candidate of [e.statusCode, e.status, e.response?.status]) {
    if (typeof candidate === 'number') return candidate
  }
  return undefined
}

/** Nest puts the exception message in `data.message`; ofetch also surfaces it as
 * `_data`. Both are checked so the code survives either shape. */
function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { data?: { message?: unknown }; response?: { _data?: { message?: unknown } } }
  const message = e.data?.message ?? e.response?._data?.message
  return typeof message === 'string' ? message : null
}
