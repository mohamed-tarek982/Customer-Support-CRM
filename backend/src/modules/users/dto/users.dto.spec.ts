import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { AssignRoleDto } from './assign-role.dto';
import { ListUsersQueryDto } from './list-users-query.dto';
import { USER_ROLES } from '../users.constants';

/**
 * The DTOs are the first line of the role allow-list: `User.role` is a plain
 * String column, so nothing below this layer stops `role: 'superuser'` from
 * being written. These tests run the same transform-then-validate pipeline the
 * global ValidationPipe uses, so a decorator that is present but ineffective
 * (the usual failure — a missing `@Transform`, or `@IsIn` on the wrong field)
 * shows up here rather than in production.
 */
const VALID_CREATE = {
  email: 'new@example.com',
  name: 'New Person',
  role: 'agent',
  password: 'test-password-123',
};

/** Mirrors the global pipe: transform, then validate. */
function check<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const instance = plainToInstance(cls, payload, { enableImplicitConversion: true });
  const errors = validateSync(instance as object, { whitelist: true });
  return { instance, failed: errors.map((error) => error.property) };
}

describe('CreateUserDto', () => {
  it('accepts a well-formed payload', () => {
    expect(check(CreateUserDto, VALID_CREATE).failed).toEqual([]);
  });

  it('lower-cases and trims the email, which is what makes the unique index case-insensitive', () => {
    const { instance } = check(CreateUserDto, { ...VALID_CREATE, email: '  New@Example.COM ' });

    expect(instance.email).toBe('new@example.com');
  });

  it('trims the name', () => {
    const { instance } = check(CreateUserDto, { ...VALID_CREATE, name: '  New Person  ' });

    expect(instance.name).toBe('New Person');
  });

  it('leaves a non-ASCII name intact', () => {
    const { instance, failed } = check(CreateUserDto, { ...VALID_CREATE, name: 'محمد طارق' });

    expect(failed).toEqual([]);
    expect(instance.name).toBe('محمد طارق');
  });

  it('rejects a malformed email', () => {
    expect(check(CreateUserDto, { ...VALID_CREATE, email: 'not-an-email' }).failed).toContain(
      'email',
    );
  });

  it('rejects a missing email', () => {
    const { email, ...withoutEmail } = VALID_CREATE;
    void email;

    expect(check(CreateUserDto, withoutEmail).failed).toContain('email');
  });

  it('rejects a blank name rather than storing whitespace', () => {
    expect(check(CreateUserDto, { ...VALID_CREATE, name: '   ' }).failed).toContain('name');
  });

  it('rejects a password below the login form floor', () => {
    expect(check(CreateUserDto, { ...VALID_CREATE, password: 'short' }).failed).toContain(
      'password',
    );
  });

  it('rejects a role that is not in the allow-list', () => {
    expect(check(CreateUserDto, { ...VALID_CREATE, role: 'superuser' }).failed).toContain('role');
  });

  it('accepts every role the system defines', () => {
    for (const role of USER_ROLES) {
      expect(check(CreateUserDto, { ...VALID_CREATE, role }).failed).toEqual([]);
    }
  });

  it('treats branch and department as optional', () => {
    expect(check(CreateUserDto, VALID_CREATE).failed).not.toContain('branchId');
  });
});

describe('UpdateUserDto', () => {
  it('accepts an empty patch', () => {
    expect(check(UpdateUserDto, {}).failed).toEqual([]);
  });

  it('accepts a single field', () => {
    expect(check(UpdateUserDto, { name: 'Renamed' }).failed).toEqual([]);
  });

  it('still rejects an unknown role', () => {
    expect(check(UpdateUserDto, { role: 'superuser' }).failed).toContain('role');
  });

  it('still rejects a malformed email', () => {
    expect(check(UpdateUserDto, { email: 'nope' }).failed).toContain('email');
  });

  it('has no password property, so the global pipe rejects one instead of applying it', () => {
    expect(Object.keys(new UpdateUserDto())).not.toContain('password');
  });
});

describe('AssignRoleDto', () => {
  it('accepts a known role', () => {
    expect(check(AssignRoleDto, { role: 'admin' }).failed).toEqual([]);
  });

  it('rejects an unknown role', () => {
    expect(check(AssignRoleDto, { role: 'root' }).failed).toContain('role');
  });

  it('rejects a missing role', () => {
    expect(check(AssignRoleDto, {}).failed).toContain('role');
  });
});

describe('ListUsersQueryDto', () => {
  it('accepts an empty query', () => {
    expect(check(ListUsersQueryDto, {}).failed).toEqual([]);
  });

  it('reads isActive=false off the query string as a boolean, not as a truthy string', () => {
    const { instance, failed } = check(ListUsersQueryDto, { isActive: 'false' });

    expect(failed).toEqual([]);
    expect(instance.isActive).toBe(false);
  });

  it('reads isActive=true the same way', () => {
    expect(check(ListUsersQueryDto, { isActive: 'true' }).instance.isActive).toBe(true);
  });

  it('rejects a non-boolean isActive rather than guessing', () => {
    expect(check(ListUsersQueryDto, { isActive: 'maybe' }).failed).toContain('isActive');
  });

  it('rejects a page size above the ceiling, so one request cannot dump the roster', () => {
    expect(check(ListUsersQueryDto, { pageSize: 5000 }).failed).toContain('pageSize');
  });

  it('rejects a page below one', () => {
    expect(check(ListUsersQueryDto, { page: 0 }).failed).toContain('page');
  });

  it('rejects an unknown role filter', () => {
    expect(check(ListUsersQueryDto, { role: 'superuser' }).failed).toContain('role');
  });
});
