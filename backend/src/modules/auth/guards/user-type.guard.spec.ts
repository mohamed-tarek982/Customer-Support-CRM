import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserTypeGuard } from './user-type.guard';
import { USER_TYPES_KEY } from '../decorators/user-type.decorator';
import type { AuthenticatedUser, UserType } from '../../../common/types/authenticated-user';

function contextFor(userType: UserType | undefined): ExecutionContext {
  const user =
    userType === undefined
      ? undefined
      : ({
          sub: 's',
          email: 'e',
          role: '',
          userType,
          branchId: null,
          departmentId: null,
        } as AuthenticatedUser);

  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('UserTypeGuard', () => {
  function guardWith(required: UserType[] | undefined): UserTypeGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new UserTypeGuard(reflector);
  }

  it('allows a route with no @UserTypes metadata', () => {
    expect(guardWith(undefined).canActivate(contextFor('customer'))).toBe(true);
  });

  it('rejects a customer principal on a staff-only handler', () => {
    expect(() => guardWith(['staff']).canActivate(contextFor('customer'))).toThrow(
      ForbiddenException,
    );
  });

  it('lets a staff principal through a staff-only handler', () => {
    expect(guardWith(['staff']).canActivate(contextFor('staff'))).toBe(true);
  });

  it('rejects an unauthenticated request on a typed handler', () => {
    expect(() => guardWith(['staff']).canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('reads the metadata under the documented key', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['staff']),
    } as unknown as Reflector;
    new UserTypeGuard(reflector).canActivate(contextFor('staff'));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(USER_TYPES_KEY, expect.any(Array));
  });
});
