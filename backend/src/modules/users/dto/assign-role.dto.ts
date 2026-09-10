import { IsIn } from 'class-validator';
import { USER_ROLES, type UserRole } from '../users.constants';

/** Body for `POST /users/:id/role`. */
export class AssignRoleDto {
  @IsIn(USER_ROLES, { message: `role must be one of: ${USER_ROLES.join(', ')}` })
  role!: UserRole;
}
