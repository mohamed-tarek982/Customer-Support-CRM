import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { USER_ROLES, type UserRole } from '../users.constants';

/**
 * Validation for `PATCH /users/:id`.
 *
 * Written out rather than derived with `PartialType(CreateUserDto)`, because
 * `@nestjs/mapped-types` is not a dependency of this service and a whole package
 * is a steep price for one class. The rules below are the create rules minus
 * `password`, and they must be kept in step with `CreateUserDto`.
 *
 * `password` is absent on purpose, not merely optional: setting someone else's
 * password from a profile edit is a different action with different
 * consequences, and it belongs to the `auth.reset` flow the user drives
 * themselves. Because the global ValidationPipe runs with
 * `forbidNonWhitelisted`, a request that sends `password` here is rejected with
 * a 400 rather than silently ignored.
 *
 * `role` stays, so the edit dialog can save a role change in the same request;
 * it goes through the same last-admin guard as `POST /users/:id/role`.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES, { message: `role must be one of: ${USER_ROLES.join(', ')}` })
  role?: UserRole;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  departmentId?: string | null;
}
