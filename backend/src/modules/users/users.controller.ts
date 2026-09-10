import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService, type PaginatedUsers, type UserResponse } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { SetUserActiveDto } from './dto/set-user-active.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserTypes } from '../auth/decorators/user-type.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Staff account administration (SCRUM-34). Admin-only, end to end.
 *
 * Three guards are in play and only one of them is wired here:
 *   - `JwtAuthGuard` and `UserTypeGuard` are registered globally in AuthModule,
 *     so authentication and the staff/customer boundary already apply. The
 *     `@UserTypes('staff')` below is what gives the second one something to
 *     enforce, and it is what turns a customer's request into a 403.
 *   - `RolesGuard` is still opt-in, so it is added with `@UseGuards` here and
 *     `@Roles('admin')` sits on the class: every route on this controller,
 *     reads included, is for admins only. A user list is not something an agent
 *     needs, and the roster is exactly what an attacker wants first.
 *
 * Mutations are audited automatically by the global `AuditLogInterceptor`. Do
 * not add `@UseInterceptors(AuditLogInterceptor)` here — it would double-log.
 */
@UseGuards(RolesGuard)
@UserTypes('staff')
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedUsers> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<UserResponse> {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponse> {
    return this.users.update(id, dto);
  }

  /**
   * The acting admin is read from the token rather than the body, so
   * "deactivate yourself" cannot be disguised as deactivating someone else.
   */
  @Post(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.users.deactivate(id, actor.sub);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string): Promise<UserResponse> {
    return this.users.reactivate(id);
  }

  /** Set the flag directly. Same two paths as the pair above, one request. */
  @Post(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return dto.isActive ? this.users.reactivate(id) : this.users.deactivate(id, actor.sub);
  }

  @Post(':id/role')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto): Promise<UserResponse> {
    return this.users.assignRole(id, dto.role);
  }
}
