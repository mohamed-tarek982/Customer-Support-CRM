import { IsBoolean } from 'class-validator';

/**
 * Body for the combined activation endpoint. The dedicated
 * `POST /users/:id/deactivate` and `/reactivate` routes take no body; this DTO
 * exists for a caller that wants to set the flag directly.
 */
export class SetUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
