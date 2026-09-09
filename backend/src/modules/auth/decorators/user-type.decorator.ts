import { SetMetadata } from '@nestjs/common';
import type { UserType } from '../../../common/types/authenticated-user';

export const USER_TYPES_KEY = 'userTypes';

/**
 * Declares which principal types may reach a route (SCRUM-43):
 *   `@UserTypes('staff')`    — staff-only controllers (the main app API)
 *   `@UserTypes('customer')` — portal-only controllers (Phase 5)
 *
 * Enforced by `UserTypeGuard`, which is registered globally. A route with no
 * `@UserTypes(...)` is reachable by either principal type once authenticated.
 */
export const UserTypes = (...types: UserType[]) => SetMetadata(USER_TYPES_KEY, types);
