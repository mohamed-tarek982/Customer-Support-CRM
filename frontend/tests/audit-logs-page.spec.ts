import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_LOG_FILTER_DEFAULTS,
  actionPath,
  actionVerb,
  auditLogErrorKey,
  auditLogErrorStatus,
  canReadAuditLogs,
  formatMetadata,
  hasActiveFilters,
  hasMetadata,
  isInvalidRange,
  toIsoBound,
  toAuditLogListQuery,
  verbColor,
  type AuditLogRow,
} from '../utils/audit-logs-form'
import { STAFF_NAV, staffNavFor } from '../composables/useNavigation'

/**
 * The audit-logs SFC is a Nuxt page (definePageMeta, useI18n, Vuetify) and
 * cannot be mounted without the Nuxt build, so the same split as the users and
 * settings suites applies: the page's decisions live in utils/audit-logs-form.ts
 * and are covered here, and the rendered screen is covered by the manual smoke
 * steps and the backend e2e suite.
 */

const ROW: AuditLogRow = {
  id: 'log-1',
  actorUserId: 'admin-1',
  action: 'POST /api/v1/users',
  resourceType: 'users',
  resourceId: 'user-9',
  branchId: null,
  departmentId: null,
  statusCode: 201,
  metadata: { ip: '127.0.0.1', body: { email: 'a@b.com' } },
  createdAt: '2026-09-10T12:00:00.000Z',
}

describe('canReadAuditLogs', () => {
  it('lets an admin in', () => {
    expect(canReadAuditLogs('admin')).toBe(true)
  })

  it('keeps an agent out', () => {
    expect(canReadAuditLogs('agent')).toBe(false)
  })

  it('treats a missing role as not an admin', () => {
    expect(canReadAuditLogs(null)).toBe(false)
    expect(canReadAuditLogs(undefined)).toBe(false)
    expect(canReadAuditLogs('')).toBe(false)
  })
})

describe('toAuditLogListQuery', () => {
  it('sends only pagination when no filter is set', () => {
    expect(toAuditLogListQuery(AUDIT_LOG_FILTER_DEFAULTS)).toEqual({ page: 1, pageSize: 25 })
  })

  it('carries the requested page and size', () => {
    expect(toAuditLogListQuery(AUDIT_LOG_FILTER_DEFAULTS, 3, 10)).toMatchObject({ page: 3, pageSize: 10 })
  })

  it('wires every text filter to its API parameter', () => {
    expect(
      toAuditLogListQuery({
        ...AUDIT_LOG_FILTER_DEFAULTS,
        actorUserId: 'admin-1',
        action: 'POST',
        resourceType: 'users',
        resourceId: 'user-9',
        q: 'settings',
      }),
    ).toMatchObject({
      actorUserId: 'admin-1',
      action: 'POST',
      resourceType: 'users',
      resourceId: 'user-9',
      q: 'settings',
    })
  })

  it('trims each filter and drops one that is only whitespace', () => {
    expect(toAuditLogListQuery({ ...AUDIT_LOG_FILTER_DEFAULTS, q: '  users  ' })).toMatchObject({ q: 'users' })
    expect(toAuditLogListQuery({ ...AUDIT_LOG_FILTER_DEFAULTS, q: '   ' })).not.toHaveProperty('q')
  })

  it('omits every filter the admin left blank, rather than sending empty strings', () => {
    // An empty `actorUserId` reaching the API would narrow the trail instead of
    // widening it, which is the one direction an audit filter must never fail.
    const query = toAuditLogListQuery(AUDIT_LOG_FILTER_DEFAULTS)

    for (const key of ['actorUserId', 'action', 'resourceType', 'resourceId', 'q', 'from', 'to']) {
      expect(query).not.toHaveProperty(key)
    }
  })

  it('sends the from date as the first instant of that day', () => {
    expect(toAuditLogListQuery({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-01' })).toMatchObject({
      from: '2026-09-01T00:00:00.000Z',
    })
  })

  it('sends the to date as the last instant of that day, not midnight', () => {
    // Both API bounds are inclusive. A midnight upper bound would silently drop
    // everything that happened on the day the admin picked.
    expect(toAuditLogListQuery({ ...AUDIT_LOG_FILTER_DEFAULTS, to: '2026-09-30' })).toMatchObject({
      to: '2026-09-30T23:59:59.999Z',
    })
  })

  it('drops an unparseable date instead of sending Invalid Date to the API', () => {
    expect(toAuditLogListQuery({ ...AUDIT_LOG_FILTER_DEFAULTS, from: 'not-a-date' })).not.toHaveProperty('from')
  })
})

describe('toIsoBound', () => {
  it('is null for an empty or whitespace value', () => {
    expect(toIsoBound('', 'start')).toBeNull()
    expect(toIsoBound('   ', 'end')).toBeNull()
  })

  it('anchors each edge of the day', () => {
    expect(toIsoBound('2026-09-10', 'start')).toBe('2026-09-10T00:00:00.000Z')
    expect(toIsoBound('2026-09-10', 'end')).toBe('2026-09-10T23:59:59.999Z')
  })
})

describe('hasActiveFilters', () => {
  it('is false for the untouched defaults', () => {
    expect(hasActiveFilters(AUDIT_LOG_FILTER_DEFAULTS)).toBe(false)
  })

  it('is true once any filter carries a value', () => {
    expect(hasActiveFilters({ ...AUDIT_LOG_FILTER_DEFAULTS, q: 'users' })).toBe(true)
    expect(hasActiveFilters({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-01' })).toBe(true)
  })

  it('ignores a whitespace-only value, so the two empty states stay honest', () => {
    expect(hasActiveFilters({ ...AUDIT_LOG_FILTER_DEFAULTS, q: '   ' })).toBe(false)
  })
})

describe('isInvalidRange', () => {
  it('accepts a range in order', () => {
    expect(isInvalidRange({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-01', to: '2026-09-30' })).toBe(false)
  })

  it('accepts a single-day range', () => {
    expect(isInvalidRange({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-10', to: '2026-09-10' })).toBe(false)
  })

  it('flags an inverted range, mirroring the 400 the API would return', () => {
    expect(isInvalidRange({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-30', to: '2026-09-01' })).toBe(true)
  })

  it('says nothing while only one bound is set', () => {
    expect(isInvalidRange({ ...AUDIT_LOG_FILTER_DEFAULTS, from: '2026-09-30' })).toBe(false)
    expect(isInvalidRange({ ...AUDIT_LOG_FILTER_DEFAULTS, to: '2026-09-01' })).toBe(false)
  })
})

describe('formatMetadata', () => {
  it('pretty-prints a recorded body', () => {
    expect(formatMetadata({ ip: '127.0.0.1' })).toBe('{\n  "ip": "127.0.0.1"\n}')
  })

  it('renders a truncated payload verbatim, without quoting it as JSON', () => {
    // The interceptor writes the literal string when a body is too large. Round
    // -tripping it through JSON.stringify would render "[TRUNCATED]" with
    // quotes and imply it was the recorded value rather than a marker.
    expect(formatMetadata('[TRUNCATED]')).toBe('[TRUNCATED]')
  })

  it('renders an empty string for a row with nothing recorded', () => {
    expect(formatMetadata(null)).toBe('')
    expect(formatMetadata(undefined)).toBe('')
  })

  it('falls back to text rather than throwing inside the template', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => formatMetadata(cyclic)).not.toThrow()
  })
})

describe('hasMetadata', () => {
  it('is true for a row with a recorded body', () => {
    expect(hasMetadata(ROW)).toBe(true)
  })

  it('is false for a row with nothing to expand', () => {
    expect(hasMetadata({ ...ROW, metadata: null })).toBe(false)
  })

  it('is true for a truncated marker, which is still worth showing', () => {
    expect(hasMetadata({ ...ROW, metadata: '[TRUNCATED]' })).toBe(true)
  })
})

describe('action rendering', () => {
  it('splits the verb the interceptor wrote off the route path', () => {
    expect(actionVerb('POST /api/v1/users')).toBe('POST')
    expect(actionPath('POST /api/v1/users')).toBe('/api/v1/users')
  })

  it('recognises every verb the interceptor audits', () => {
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(actionVerb(`${verb} /api/v1/settings`)).toBe(verb)
    }
  })

  it('renders an action in some other shape whole, rather than eating its first word', () => {
    expect(actionVerb('legacy-import')).toBeNull()
    expect(actionPath('legacy-import')).toBe('legacy-import')
  })

  it('colours a destructive action so it stands out while scanning', () => {
    expect(verbColor('DELETE')).toBe('error')
    expect(verbColor('POST')).toBe('success')
    expect(verbColor('PATCH')).toBe('warning')
    expect(verbColor(null)).toBe('secondary')
  })

  it('uses theme names, never a hex value', () => {
    for (const verb of ['DELETE', 'POST', 'PUT', 'PATCH', 'GET', null]) {
      expect(verbColor(verb)).toMatch(/^[a-z]+$/)
    }
  })
})

describe('auditLogErrorKey', () => {
  it('maps the one refusal code the API can return to its own copy', () => {
    expect(auditLogErrorKey({ status: 400, data: { message: 'INVALID_DATE_RANGE' } })).toBe(
      'auditLogs.errors.invalidDateRange',
    )
  })

  it('reads the code off the ofetch response shape as well', () => {
    expect(
      auditLogErrorKey({ response: { status: 400, _data: { message: 'INVALID_DATE_RANGE' } } }),
    ).toBe('auditLogs.errors.invalidDateRange')
  })

  it('falls back on status when the body carries no code', () => {
    expect(auditLogErrorKey({ status: 403 })).toBe('auditLogs.errors.forbidden')
    expect(auditLogErrorKey({ status: 400 })).toBe('auditLogs.errors.validation')
    expect(auditLogErrorKey({ status: 500 })).toBe('auditLogs.errors.generic')
  })

  it('distinguishes an unreachable API from a rejected request', () => {
    expect(auditLogErrorKey(new Error('Failed to fetch'))).toBe('auditLogs.errors.network')
  })

  it('never renders a raw code at the admin for a message it does not know', () => {
    expect(auditLogErrorKey({ status: 409, data: { message: 'SOME_NEW_CODE' } })).toBe(
      'auditLogs.errors.generic',
    )
  })
})

describe('auditLogErrorStatus', () => {
  it('reads the status off each shape ofetch uses', () => {
    expect(auditLogErrorStatus({ statusCode: 400 })).toBe(400)
    expect(auditLogErrorStatus({ status: 403 })).toBe(403)
    expect(auditLogErrorStatus({ response: { status: 500 } })).toBe(500)
  })

  it('is undefined when the request never got a response', () => {
    expect(auditLogErrorStatus(new Error('offline'))).toBeUndefined()
    expect(auditLogErrorStatus(null)).toBeUndefined()
  })
})

describe('staff navigation gating', () => {
  it('shows the audit-log entry to an admin', () => {
    expect(staffNavFor('admin').some((item) => item.to === '/staff/audit-logs')).toBe(true)
  })

  it('hides it from an agent', () => {
    expect(staffNavFor('agent').some((item) => item.to === '/staff/audit-logs')).toBe(false)
  })

  it('hides it before the session has resolved, rather than flashing it', () => {
    expect(staffNavFor(null).some((item) => item.to === '/staff/audit-logs')).toBe(false)
    expect(staffNavFor(undefined).some((item) => item.to === '/staff/audit-logs')).toBe(false)
  })

  it('gives it its own icon, not one another entry already uses', () => {
    const entry = STAFF_NAV.find((item) => item.to === '/staff/audit-logs')
    const others = STAFF_NAV.filter((item) => item.to !== '/staff/audit-logs').map(
      (item) => item.icon,
    )

    expect(entry?.icon).toBeTruthy()
    expect(others).not.toContain(entry?.icon)
  })
})

describe('audit log i18n copy', () => {
  const dir = resolve(__dirname, '../i18n/locales')
  const read = (file: string) =>
    JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as Record<string, unknown>

  function flatten(value: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return child !== null && typeof child === 'object'
        ? flatten(child as Record<string, unknown>, path)
        : [path]
    })
  }

  const auditKeys = (file: string) =>
    flatten(read(file))
      .filter((key) => key.startsWith('auditLogs.'))
      .sort()

  it('defines an identical auditLogs.* key set in English and Arabic', () => {
    expect(auditKeys('ar.json')).toEqual(auditKeys('en.json'))
  })

  it('names the sidebar entry in both locales', () => {
    for (const file of ['en.json', 'ar.json']) {
      expect(flatten(read(file))).toContain('nav.staff.auditLogs')
    }
  })

  it('covers every column, filter and state the page renders', () => {
    const keys = auditKeys('en.json')

    for (const key of [
      'auditLogs.title',
      'auditLogs.subtitle',
      'auditLogs.loading',
      'auditLogs.empty',
      'auditLogs.emptyFiltered',
      'auditLogs.adminOnlyNotice',
      'auditLogs.anonymous',
      'auditLogs.none',
      'auditLogs.filters.legend',
      'auditLogs.filters.search',
      'auditLogs.filters.searchPlaceholder',
      'auditLogs.filters.actor',
      'auditLogs.filters.action',
      'auditLogs.filters.resourceType',
      'auditLogs.filters.resourceId',
      'auditLogs.filters.from',
      'auditLogs.filters.to',
      'auditLogs.filters.clear',
      'auditLogs.table.caption',
      'auditLogs.table.timestamp',
      'auditLogs.table.actor',
      'auditLogs.table.action',
      'auditLogs.table.resourceType',
      'auditLogs.table.resourceId',
      'auditLogs.table.details',
      'auditLogs.actions.toggleDetails',
      'auditLogs.hints.actorId',
      'auditLogs.hints.resourceType',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('names every error the page can show', () => {
    const keys = auditKeys('en.json')

    for (const key of [
      'auditLogs.errors.invalidDateRange',
      'auditLogs.errors.forbidden',
      'auditLogs.errors.validation',
      'auditLogs.errors.network',
      'auditLogs.errors.generic',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('translates the Arabic copy rather than leaving the English through', () => {
    const en = read('en.json') as { auditLogs: { title: string; empty: string } }
    const ar = read('ar.json') as { auditLogs: { title: string; empty: string } }

    expect(ar.auditLogs.title).not.toBe(en.auditLogs.title)
    expect(ar.auditLogs.empty).not.toBe(en.auditLogs.empty)
  })
})
