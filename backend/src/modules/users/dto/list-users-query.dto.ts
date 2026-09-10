import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  USERS_MAX_PAGE_SIZE,
  USERS_PAGE_SIZE,
  USER_ROLES,
  type UserRole,
} from '../users.constants';

/**
 * Query string for `GET /users`.
 *
 * The global ValidationPipe runs with `forbidNonWhitelisted`, so every filter
 * the UI can send has to be declared here or the request is a 400. That is the
 * intended behaviour: a typo'd filter name must not silently widen the result
 * set to every user in the installation.
 *
 * `isActive` is transformed by hand rather than left to implicit conversion,
 * because a query string carries `"false"`, and every non-empty string is truthy
 * once cast to Boolean — the filter would return active users either way.
 */
export class ListUsersQueryDto {
  /** Free-text match against email and name, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    // Read the raw query value off `obj`, not the `value` argument. The global
    // pipe runs with `enableImplicitConversion`, which has already cast the
    // string to the declared Boolean type by the time a custom transform sees
    // it — and `Boolean('false')` is `true`, so `?isActive=false` would silently
    // return the active users. `obj` still holds the untouched query string.
    const raw = obj[key];
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(USERS_MAX_PAGE_SIZE)
  pageSize?: number = USERS_PAGE_SIZE;
}
