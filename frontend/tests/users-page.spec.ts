import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CREATE_USER_DEFAULTS,
  FILTER_DEFAULTS,
  USER_ROLES,
  buildCreateUserSchema,
  buildUpdateUserSchema,
  canDeactivate,
  canManageUsers,
  changedUserFields,
  roleOptions,
  toListQuery,
  toUpdateForm,
  userErrorKey,
  userErrorStatus,
  type UserRow,
} from '../utils/users-form'
import { STAFF_NAV, staffNavFor } from '../composables/useNavigation'

/**
 * The users SFC is a Nuxt page (definePageMeta, useI18n, Vuetify) and cannot be
 * mounted without the Nuxt build, so the same split as login and settings
 * applies: the page's decisions live in utils/users-form.ts and are covered
 * here, and the rendered screen is covered by the manual smoke steps and the
 * backend e2e suite.
 */

// Identity translator: assert on the key, not the copy.
const t = (key: string) => key

const ROW: UserRow = {
  id: 'user-1',
  email: 'agent@example.com',
  name: 'Ann Agent',
  role: 'agent',
  branchId: 'branch-1',
  departmentId: 'dept-1',
  isActive: true,
  deactivatedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const VALID_CREATE = {
  email: 'new@example.com',
  name: 'New Person',
  role: 'agent',
  branchId: null,
  departmentId: null,
  password: 'test-password-123',
}

/** Either schema, so one helper covers create and update. */
type UserSchema = ReturnType<typeof buildCreateUserSchema> | ReturnType<typeof buildUpdateUserSchema>

async function firstError(schema: UserSchema, value: unknown) {
  try {
    await schema.validate(value as never, { abortEarly: true })
    return null
  } catch (err) {
    return (err as { message: string }).message
  }
}

describe('canManageUsers', () => {
  it('lets an admin in', () => {
    expect(canManageUsers('admin')).toBe(true)
  })

  it('keeps an agent out', () => {
    expect(canManageUsers('agent')).toBe(false)
  })

  it('treats a missing role as not an admin', () => {
    expect(canManageUsers(null)).toBe(false)
    expect(canManageUsers(undefined)).toBe(false)
    expect(canManageUsers('')).toBe(false)
  })
})

describe('canDeactivate', () => {
  it('allows disabling somebody else', () => {
    expect(canDeactivate(ROW, 'admin-1')).toBe(true)
  })

  it('refuses self-deactivation, mirroring what the API would reject', () => {
    expect(canDeactivate(ROW, ROW.id)).toBe(false)
  })

  it('is false for a row that is already disabled', () => {
    expect(canDeactivate({ ...ROW, isActive: false }, 'admin-1')).toBe(false)
  })

  it('still offers the action when the session id is unknown, leaving the call to the API', () => {
    // Only self-deactivation is blocked, and without an actor id there is no
    // self to compare against. The API refuses it either way, so the worst case
    // is one wasted request rather than a button that does nothing all session.
    expect(canDeactivate(ROW, null)).toBe(true)
    expect(canDeactivate(ROW, undefined)).toBe(true)
  })
})

describe('toUpdateForm', () => {
  it('seeds the edit form from a row', () => {
    expect(toUpdateForm(ROW)).toEqual({
      email: 'agent@example.com',
      name: 'Ann Agent',
      role: 'agent',
      branchId: 'branch-1',
      departmentId: 'dept-1',
    })
  })

  it('turns a null name into an empty string, because an input cannot bind null', () => {
    expect(toUpdateForm({ ...ROW, name: null }).name).toBe('')
  })

  it('falls back to agent for a role the frontend does not know', () => {
    // A backend that gains a role before the frontend does must not put an
    // unselectable value into the select.
    expect(toUpdateForm({ ...ROW, role: 'supervisor' }).role).toBe('agent')
  })
})

describe('changedUserFields', () => {
  const original = toUpdateForm(ROW)

  it('is empty when nothing was edited, which is what suppresses the request', () => {
    expect(changedUserFields(original, { ...original })).toEqual({})
  })

  it('sends only the edited field', () => {
    expect(changedUserFields(original, { ...original, name: 'Renamed' })).toEqual({
      name: 'Renamed',
    })
  })

  it('carries a role change through on its own, without restating the profile', () => {
    expect(changedUserFields(original, { ...original, role: 'admin' })).toEqual({ role: 'admin' })
  })

  it('collects several edits into one patch', () => {
    expect(changedUserFields(original, { ...original, name: 'Renamed', email: 'a@b.com' })).toEqual({
      name: 'Renamed',
      email: 'a@b.com',
    })
  })

  it('sends an explicit null when a branch is cleared', () => {
    expect(changedUserFields(original, { ...original, branchId: null })).toEqual({ branchId: null })
  })
})

describe('toListQuery', () => {
  it('sends only pagination when no filter is set', () => {
    expect(toListQuery(FILTER_DEFAULTS)).toEqual({ page: 1, pageSize: 25 })
  })

  it('keeps isActive=false, which a truthiness check would silently drop', () => {
    // This is the bug the helper exists to prevent: dropping it turns "show me
    // the disabled accounts" into "show me everyone".
    expect(toListQuery({ ...FILTER_DEFAULTS, isActive: false })).toMatchObject({ isActive: false })
  })

  it('keeps isActive=true', () => {
    expect(toListQuery({ ...FILTER_DEFAULTS, isActive: true })).toMatchObject({ isActive: true })
  })

  it('omits isActive entirely when no status is chosen', () => {
    expect(toListQuery(FILTER_DEFAULTS)).not.toHaveProperty('isActive')
  })

  it('trims the search term and drops it when it is only whitespace', () => {
    expect(toListQuery({ ...FILTER_DEFAULTS, q: '  ann  ' })).toMatchObject({ q: 'ann' })
    expect(toListQuery({ ...FILTER_DEFAULTS, q: '   ' })).not.toHaveProperty('q')
  })

  it('passes the role and tenant filters through', () => {
    expect(
      toListQuery({ ...FILTER_DEFAULTS, role: 'admin', branchId: 'b1', departmentId: 'd1' }),
    ).toMatchObject({ role: 'admin', branchId: 'b1', departmentId: 'd1' })
  })

  it('carries the requested page', () => {
    expect(toListQuery(FILTER_DEFAULTS, 3, 10)).toMatchObject({ page: 3, pageSize: 10 })
  })
})

describe('userErrorKey', () => {
  const withCode = (code: string, status = 409) => ({ status, data: { message: code } })

  it('maps every refusal code the API can return to its own copy', () => {
    expect(userErrorKey(withCode('EMAIL_TAKEN'))).toBe('users.errors.emailTaken')
    expect(userErrorKey(withCode('CANNOT_DEACTIVATE_SELF'))).toBe(
      'users.errors.cannotDeactivateSelf',
    )
    expect(userErrorKey(withCode('LAST_ACTIVE_ADMIN'))).toBe('users.errors.lastActiveAdmin')
    expect(userErrorKey(withCode('INVALID_BRANCH', 400))).toBe('users.errors.invalidBranch')
    expect(userErrorKey(withCode('INVALID_DEPARTMENT', 400))).toBe('users.errors.invalidDepartment')
  })

  it('reads the code off the ofetch response shape as well', () => {
    expect(userErrorKey({ response: { status: 409, _data: { message: 'EMAIL_TAKEN' } } })).toBe(
      'users.errors.emailTaken',
    )
  })

  it('falls back on status when the body carries no code', () => {
    expect(userErrorKey({ status: 403 })).toBe('users.errors.forbidden')
    expect(userErrorKey({ status: 404 })).toBe('users.errors.notFound')
    expect(userErrorKey({ status: 400 })).toBe('users.errors.validation')
    expect(userErrorKey({ status: 500 })).toBe('users.errors.generic')
  })

  it('distinguishes an unreachable API from a rejected request', () => {
    // A dead backend used to render as "something went wrong", which made an
    // outage indistinguishable from a validation failure.
    expect(userErrorKey(new Error('Failed to fetch'))).toBe('users.errors.network')
  })

  it('never renders a raw code at the admin for a message it does not know', () => {
    expect(userErrorKey(withCode('SOME_NEW_CODE'))).toBe('users.errors.generic')
  })
})

describe('userErrorStatus', () => {
  it('reads the status off each shape ofetch uses', () => {
    expect(userErrorStatus({ statusCode: 409 })).toBe(409)
    expect(userErrorStatus({ status: 403 })).toBe(403)
    expect(userErrorStatus({ response: { status: 404 } })).toBe(404)
  })

  it('is undefined when the request never got a response', () => {
    expect(userErrorStatus(new Error('offline'))).toBeUndefined()
    expect(userErrorStatus(null)).toBeUndefined()
  })
})

describe('role options', () => {
  it('come from the shared role list rather than a hard-coded array', () => {
    expect(roleOptions(t).map((option) => option.value)).toEqual([...USER_ROLES])
  })

  it('label each role with an i18n key, never a literal', () => {
    for (const option of roleOptions(t)) {
      expect(option.title).toBe(`users.roles.${option.value}`)
    }
  })

  it('starts a new account as the least privileged role', () => {
    expect(CREATE_USER_DEFAULTS.role).toBe('agent')
  })
})

describe('create schema', () => {
  const schema = buildCreateUserSchema(t)

  it('accepts a well-formed account', async () => {
    await expect(schema.validate(VALID_CREATE)).resolves.toBeTruthy()
  })

  it('flags a missing name', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, name: '' })).toBe(
      'users.validation.nameRequired',
    )
  })

  it('flags a name that is only whitespace', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, name: '   ' })).toBe(
      'users.validation.nameRequired',
    )
  })

  it('flags an over-long name', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, name: 'x'.repeat(121) })).toBe(
      'users.validation.nameMax',
    )
  })

  it('flags a malformed email', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, email: 'nope' })).toBe(
      'users.validation.emailFormat',
    )
  })

  it('rejects a role the backend would refuse, so the round trip never happens', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, role: 'superuser' })).toBe(
      'users.validation.roleUnknown',
    )
  })

  it('accepts every role the system defines', async () => {
    for (const role of USER_ROLES) {
      await expect(schema.validate({ ...VALID_CREATE, role })).resolves.toBeTruthy()
    }
  })

  it('holds the password to the same floor as the login form', async () => {
    expect(await firstError(schema, { ...VALID_CREATE, password: 'short' })).toBe(
      'users.validation.passwordMin',
    )
  })

  it('treats branch and department as optional', async () => {
    await expect(
      schema.validate({ ...VALID_CREATE, branchId: null, departmentId: null }),
    ).resolves.toBeTruthy()
  })
})

describe('update schema', () => {
  const schema = buildUpdateUserSchema(t)
  const { password, ...VALID_UPDATE } = VALID_CREATE
  void password

  it('accepts the profile fields without a password', async () => {
    await expect(schema.validate(VALID_UPDATE)).resolves.toBeTruthy()
  })

  it('still enforces the role allow-list', async () => {
    expect(await firstError(schema, { ...VALID_UPDATE, role: 'superuser' })).toBe(
      'users.validation.roleUnknown',
    )
  })

  it('still enforces the email format', async () => {
    expect(await firstError(schema, { ...VALID_UPDATE, email: 'nope' })).toBe(
      'users.validation.emailFormat',
    )
  })
})

describe('staff navigation gating', () => {
  it('shows the users entry to an admin', () => {
    expect(staffNavFor('admin').some((item) => item.to === '/staff/users')).toBe(true)
  })

  it('hides it from an agent', () => {
    expect(staffNavFor('agent').some((item) => item.to === '/staff/users')).toBe(false)
  })

  it('hides it before the session has resolved, rather than flashing it', () => {
    expect(staffNavFor(null).some((item) => item.to === '/staff/users')).toBe(false)
    expect(staffNavFor(undefined).some((item) => item.to === '/staff/users')).toBe(false)
  })

  it('leaves every ungated entry visible to both roles', () => {
    const ungated = STAFF_NAV.filter((item) => !item.roles).map((item) => item.to)

    for (const role of ['admin', 'agent']) {
      expect(staffNavFor(role).map((item) => item.to)).toEqual(expect.arrayContaining(ungated))
    }
  })

  it('gives the users entry its own icon, not the one Customers already uses', () => {
    const usersEntry = STAFF_NAV.find((item) => item.to === '/staff/users')
    const customersEntry = STAFF_NAV.find((item) => item.to === '/staff/customers')

    expect(usersEntry?.icon).not.toBe(customersEntry?.icon)
  })
})

describe('users i18n copy', () => {
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

  const usersKeys = (file: string) =>
    flatten(read(file))
      .filter((key) => key.startsWith('users.'))
      .sort()

  it('defines an identical users.* key set in English and Arabic', () => {
    expect(usersKeys('ar.json')).toEqual(usersKeys('en.json'))
  })

  it('names the sidebar entry in both locales', () => {
    for (const file of ['en.json', 'ar.json']) {
      expect(flatten(read(file))).toContain('nav.staff.users')
    }
  })

  it('gives every role a label, so adding a role to the list cannot leave a blank select', () => {
    const keys = usersKeys('en.json')

    for (const role of USER_ROLES) {
      expect(keys).toContain(`users.roles.${role}`)
    }
  })

  it('covers every action, column and status the page renders', () => {
    const keys = usersKeys('en.json')

    for (const key of [
      'users.title',
      'users.subtitle',
      'users.empty',
      'users.emptyFiltered',
      'users.adminOnlyNotice',
      'users.status.active',
      'users.status.inactive',
      'users.table.name',
      'users.table.email',
      'users.table.role',
      'users.table.status',
      'users.table.created',
      'users.table.actions',
      'users.actions.create',
      'users.actions.edit',
      'users.actions.assignRole',
      'users.actions.deactivate',
      'users.actions.reactivate',
      'users.actions.cancel',
      'users.actions.save',
      'users.dialogs.deactivateTitle',
      'users.dialogs.deactivateBody',
      'users.dialogs.deactivateConsequence',
      'users.toasts.created',
      'users.toasts.deactivated',
      'users.toasts.reactivated',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('names every validation message the schemas can emit', () => {
    const keys = usersKeys('en.json')

    for (const key of [
      'users.validation.emailRequired',
      'users.validation.emailFormat',
      'users.validation.nameRequired',
      'users.validation.nameMax',
      'users.validation.roleRequired',
      'users.validation.roleUnknown',
      'users.validation.passwordRequired',
      'users.validation.passwordMin',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('names every error code the API can refuse a mutation with', () => {
    const keys = usersKeys('en.json')

    for (const key of [
      'users.errors.emailTaken',
      'users.errors.cannotDeactivateSelf',
      'users.errors.lastActiveAdmin',
      'users.errors.invalidBranch',
      'users.errors.invalidDepartment',
      'users.errors.forbidden',
      'users.errors.notFound',
      'users.errors.validation',
      'users.errors.network',
      'users.errors.generic',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('keeps the interpolation placeholder in the Arabic copy too', () => {
    // A translation that drops {name} renders "will no longer be able to sign
    // in" with no indication of who, which is exactly the wrong dialog to be
    // vague in.
    for (const file of ['en.json', 'ar.json']) {
      const messages = read(file) as { users: { dialogs: Record<string, string> } }
      expect(messages.users.dialogs.deactivateBody).toContain('{name}')
      expect(messages.users.dialogs.roleBody).toContain('{name}')
    }
  })
})
