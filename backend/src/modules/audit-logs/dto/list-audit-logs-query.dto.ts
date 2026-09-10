import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { AUDIT_LOGS_MAX_PAGE_SIZE, AUDIT_LOGS_PAGE_SIZE } from '../audit-logs.constants';

/** Trim a string filter, leave anything else for the validator to reject. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Query string for `GET /audit-logs`.
 *
 * The global ValidationPipe runs with `forbidNonWhitelisted`, so every filter
 * the UI can send has to be declared here or the request is a 400. That is
 * deliberate: a typo'd filter name must not silently widen an audit query from
 * "what did this admin do" to "everything the installation has ever recorded".
 *
 * Numbers are left to the pipe's `enableImplicitConversion` exactly as
 * `ListUsersQueryDto` does — no `@Type(() => Number)`, because the pipe has
 * already cast the query string by the time a transform would see it.
 */
export class ListAuditLogsQueryDto {
  /** Exact match. An empty value must not collapse to `actorUserId: null` —
   * see the service, which only adds the column when a value was sent. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  actorUserId?: string;

  /** Substring, case-insensitive: the stored value is `"POST /api/v1/users"`,
   * so an admin filtering on `users` or on `POST` both have to work. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  resourceId?: string;

  /** Free text over action + resourceType + resourceId. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  q?: string;

  /** Inclusive lower bound on `createdAt`, ISO 8601. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on `createdAt`, ISO 8601. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AUDIT_LOGS_MAX_PAGE_SIZE)
  pageSize?: number = AUDIT_LOGS_PAGE_SIZE;
}
