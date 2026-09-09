/**
 * Shape attached to `request.user` by JwtStrategy.
 *
 * `branchId` and `departmentId` are carried in the access token so that tenant
 * scoping is available to guards, interceptors and services without a database
 * round trip. SCRUM-34 extends this with real role/permission data.
 */

/**
 * Which table a principal was authenticated against (SCRUM-43).
 * `staff` → `users`, `customer` → `customers`. Enforced server-side by
 * `UserTypeGuard`; the frontend redirect is UX only.
 */
export type UserType = 'staff' | 'customer';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  /** Empty string for customers — they have no staff role. */
  role: string;
  userType: UserType;
  branchId: string | null;
  departmentId: string | null;
}

/** Claims embedded in the signed access token. */
export interface AccessTokenPayload extends AuthenticatedUser {
  iat?: number;
  exp?: number;
}

/** Claims embedded in the signed refresh token. */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  userType: UserType;
  iat?: number;
  exp?: number;
}
