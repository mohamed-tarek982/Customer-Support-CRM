import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * RBAC SCAFFOLDING ONLY.
 *
 * Declares which roles may reach a route: `@Roles('admin')`.
 * The roles are plain strings today because the role model itself is SCRUM-34's
 * job. When that story lands, swap the string union for the real role enum —
 * the decorator name and metadata key must stay the same so existing call sites
 * keep working.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
