import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { USER_ROLES, type UserRole } from '../users.constants';

/**
 * Validation for `POST /users`.
 *
 * Email is lower-cased and trimmed here, exactly as `LoginDto` does, so a user
 * created as `Admin@Example.com` can sign in as `admin@example.com`. The unique
 * index is on the stored value, so normalising on the way in is what makes the
 * duplicate check reliable rather than case-sensitive.
 */
export class CreateUserDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

  @IsString()
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsIn(USER_ROLES, { message: `role must be one of: ${USER_ROLES.join(', ')}` })
  role!: UserRole;

  /**
   * Optional: tenant scoping is populated from the branch/department pickers,
   * and Phase 1 still has installations with a single unassigned branch.
   */
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  /**
   * Same floor as `LoginDto`, so an admin cannot create an account whose
   * password the login form would refuse to submit.
   */
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;
}
