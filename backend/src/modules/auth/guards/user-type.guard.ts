import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { USER_TYPES_KEY } from '../decorators/user-type.decorator';
import type { AuthenticatedUser, UserType } from '../../../common/types/authenticated-user';

/**
 * Enforces the staff/customer boundary server-side (SCRUM-43).
 *
 * Reads the types declared by `@UserTypes(...)` and compares them against the
 * `userType` claim on the authenticated principal. This is the real boundary: a
 * customer who manually navigates to a staff route in the SPA still gets a 403
 * here, regardless of what any Nuxt middleware did or did not do. "REDIRECT IS
 * NOT SECURITY" — the frontend guard is UX convenience only.
 *
 * Must run after `JwtAuthGuard`, which is what puts `request.user` in place.
 * A route with no `@UserTypes(...)` metadata is allowed for either type.
 *
 * Usage:
 *   `@UserTypes('staff')`    on staff-only controllers
 *   `@UserTypes('customer')` on portal-only controllers
 */
@Injectable()
export class UserTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTypes = this.reflector.getAllAndOverride<UserType[] | undefined>(USER_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredTypes || requiredTypes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!requiredTypes.includes(user.userType)) {
      throw new ForbiddenException('This endpoint is not available to your account type');
    }

    return true;
  }
}
