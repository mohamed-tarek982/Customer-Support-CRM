import * as yup from 'yup'

/**
 * User-management form logic, kept out of the SFC so it can be unit-tested
 * without mounting a Nuxt page (same split as utils/settings-form.ts).
 *
 * This duplicates the class-validator rules on the API on purpose: the frontend
 * needs instant feedback, the backend cannot trust the frontend, and a shared
 * schema would couple two release cycles. Adding a rule means editing both.
 */
type Translate = (key: string) => string

/**
 * The roles a staff account may hold.
 *
 * SINGLE SOURCE OF TRUTH for the frontend: the role select, the filter bar and
 * the validation schema all read from here, so a role never appears in the
 * dropdown without also being accepted by the form.
 *
 * Mirrors `USER_ROLES` in `backend/src/modules/users/users.constants.ts`.
 * Duplicated rather than imported: the frontend does not build against the
 * backend. Adding a role means editing both files, plus both locale files —
 * each role needs a `users.roles.<role>` key.
 */
export const USER_ROLES = ['admin', 'agent'] as const

export type UserRole = (typeof USER_ROLES)[number]

/** The role that may reach this page at all. */
export const ADMIN_ROLE: UserRole = 'admin'

/** Mirrors the API's `UserResponse`. Never carries a password of any kind. */
export interface UserRow {
  id: string
  email: string
  name: string | null
  role: string
  branchId: string | null
  departmentId: string | null
  isActive: boolean
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateUserForm {
  email: string
  name: string
  role: UserRole
  branchId: string | null
  departmentId: string | null
  password: string
}

export type UpdateUserForm = Omit<CreateUserForm, 'password'>

/** Blank create form. Also what "reset the dialog" restores. */
export const CREATE_USER_DEFAULTS: CreateUserForm = {
  email: '',
  name: '',
  role: 'agent',
  branchId: null,
  departmentId: null,
  password: '',
}

/**
 * Options for the role select. Titles are i18n keys resolved by the caller, not
 * literal strings — every visible string on this page is translated.
 */
export function roleOptions(t: Translate): { value: UserRole; title: string }[] {
  return USER_ROLES.map((role) => ({ value: role, title: t(`users.roles.${role}`) }))
}

/** Only an admin may reach the page. UX only — `@Roles('admin')` on the API is
 * the boundary, and a non-admin who types the URL still gets a 403 from it. */
export function canManageUsers(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE
}

/**
 * Whether the acting admin may disable this row.
 *
 * Mirrors the API's self-deactivation refusal so the button is disabled rather
 * than offered and then rejected. The API still enforces it — this only spares
 * the admin a pointless round trip.
 */
export function canDeactivate(row: UserRow, actorId: string | null | undefined): boolean {
  return row.isActive && row.id !== actorId
}

/** Seeds the edit form from a row. `name` is nullable on rows created before
 * the column existed, and an input cannot be bound to null. */
export function toUpdateForm(row: UserRow): UpdateUserForm {
  return {
    email: row.email,
    name: row.name ?? '',
    role: (USER_ROLES as readonly string[]).includes(row.role)
      ? (row.role as UserRole)
      : 'agent',
    branchId: row.branchId,
    departmentId: row.departmentId,
  }
}

/**
 * The PATCH body: only the fields the admin actually changed.
 *
 * Sending the whole form would clobber a concurrent admin's edit to a field this
 * admin never touched, and would log a role change in the audit trail every time
 * someone fixed a typo in a name.
 */
export function changedUserFields(
  original: UpdateUserForm,
  current: UpdateUserForm,
): Partial<UpdateUserForm> {
  const patch: Partial<UpdateUserForm> = {}

  for (const field of Object.keys(original) as (keyof UpdateUserForm)[]) {
    if (current[field] !== original[field]) {
      Object.assign(patch, { [field]: current[field] })
    }
  }

  return patch
}

/**
 * Build the query string for the list request, dropping empty filters.
 *
 * `isActive` is the one that needs care: `false` is a real filter value and
 * must survive, while `null` means "no filter". A plain truthiness check would
 * silently turn "show me the disabled accounts" into "show me everyone".
 */
export interface UserFilters {
  q: string
  role: UserRole | null
  branchId: string | null
  departmentId: string | null
  isActive: boolean | null
}

export const FILTER_DEFAULTS: UserFilters = {
  q: '',
  role: null,
  branchId: null,
  departmentId: null,
  isActive: null,
}

export function toListQuery(
  filters: UserFilters,
  page = 1,
  pageSize = 25,
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = { page, pageSize }

  if (filters.q.trim()) query.q = filters.q.trim()
  if (filters.role) query.role = filters.role
  if (filters.branchId) query.branchId = filters.branchId
  if (filters.departmentId) query.departmentId = filters.departmentId
  if (filters.isActive !== null) query.isActive = filters.isActive

  return query
}

/**
 * Map a failed request to the i18n key the page should show.
 *
 * The API answers a refused mutation with a machine-readable code rather than
 * an English sentence, precisely so this function can pick localized copy. An
 * unrecognised code falls back to the generic message instead of rendering the
 * raw code at the admin.
 */
const ERROR_KEYS: Record<string, string> = {
  EMAIL_TAKEN: 'users.errors.emailTaken',
  CANNOT_DEACTIVATE_SELF: 'users.errors.cannotDeactivateSelf',
  LAST_ACTIVE_ADMIN: 'users.errors.lastActiveAdmin',
  INVALID_BRANCH: 'users.errors.invalidBranch',
  INVALID_DEPARTMENT: 'users.errors.invalidDepartment',
}

export function userErrorKey(err: unknown): string {
  const code = errorCodeOf(err)
  if (code && ERROR_KEYS[code]) return ERROR_KEYS[code]

  const status = userErrorStatus(err)
  if (status === 403) return 'users.errors.forbidden'
  if (status === 404) return 'users.errors.notFound'
  if (status === 400) return 'users.errors.validation'
  if (status === undefined) return 'users.errors.network'
  return 'users.errors.generic'
}

/** Pull the HTTP status off an ofetch FetchError. Undefined when the request
 * never got a response at all (offline, DNS, CORS, connection refused). */
export function userErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  for (const candidate of [e.statusCode, e.status, e.response?.status]) {
    if (typeof candidate === 'number') return candidate
  }
  return undefined
}

/** Nest puts the ConflictException message in `data.message`; ofetch also
 * surfaces it as `_data`. Both are checked so the code survives either shape. */
function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { data?: { message?: unknown }; response?: { _data?: { message?: unknown } } }
  const message = e.data?.message ?? e.response?._data?.message
  return typeof message === 'string' ? message : null
}

export function buildCreateUserSchema(t: Translate) {
  return yup.object({
    email: yup
      .string()
      .required(t('users.validation.emailRequired'))
      .email(t('users.validation.emailFormat')),
    name: yup
      .string()
      .trim()
      .required(t('users.validation.nameRequired'))
      .max(120, t('users.validation.nameMax')),
    role: yup
      .string()
      .required(t('users.validation.roleRequired'))
      .oneOf([...USER_ROLES], t('users.validation.roleUnknown')),
    branchId: yup.string().nullable(),
    departmentId: yup.string().nullable(),
    password: yup
      .string()
      .required(t('users.validation.passwordRequired'))
      .min(8, t('users.validation.passwordMin')),
  })
}

/** The create schema minus the password: an admin does not set someone else's
 * password from the edit form, they use the reset flow. */
export function buildUpdateUserSchema(t: Translate) {
  return buildCreateUserSchema(t).omit(['password'])
}
