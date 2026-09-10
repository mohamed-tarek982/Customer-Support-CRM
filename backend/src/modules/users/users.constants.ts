/**
 * The roles a staff account may hold (SCRUM-34).
 *
 * SINGLE SOURCE OF TRUTH for the backend. `@Roles('admin')` call sites, the
 * create/assign DTOs and the service's last-admin guard all read from here, so
 * adding a role is one edit rather than a grep.
 *
 * Deliberately NOT a Prisma enum: `User.role` is a String column, which keeps a
 * new role a code change instead of a migration. The trade-off is that the
 * database will accept anything, so the allow-list has to be enforced above it —
 * that is what `@IsIn(USER_ROLES)` on the DTOs is for.
 *
 * Mirrored by `USER_ROLES` in `frontend/utils/users-form.ts`. Duplicated rather
 * than shared: the frontend does not build against the backend. Adding a role
 * means editing both, plus both locale files.
 */
export const USER_ROLES = ['admin', 'agent'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** The role that may manage other users. */
export const ADMIN_ROLE: UserRole = 'admin';

/**
 * Machine-readable failure codes returned to the client, so the UI can pick its
 * own copy per locale instead of parsing an English sentence out of the body.
 */
export const USER_ERROR_CODES = {
  emailTaken: 'EMAIL_TAKEN',
  cannotDeactivateSelf: 'CANNOT_DEACTIVATE_SELF',
  lastActiveAdmin: 'LAST_ACTIVE_ADMIN',
  invalidBranch: 'INVALID_BRANCH',
  invalidDepartment: 'INVALID_DEPARTMENT',
} as const;

/** Default page size for `GET /users`, and the ceiling a caller may ask for. */
export const USERS_PAGE_SIZE = 25;
export const USERS_MAX_PAGE_SIZE = 100;
