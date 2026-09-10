import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserTypes } from '../auth/decorators/user-type.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Org-wide settings (SCRUM-36).
 *
 * `JwtAuthGuard` is registered globally in AuthModule, so authentication is
 * already enforced; `RolesGuard` is still opt-in and is added here so
 * `@Roles('admin')` on the write route actually does something. Reads are open
 * to any authenticated staff member because the staff UI renders these values.
 *
 * `PUT /settings` is audited automatically by AuditLogInterceptor — no
 * per-route wiring, and adding any here would double-log.
 */
@UseGuards(RolesGuard)
@UserTypes('staff')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll(): Promise<Record<string, unknown>> {
    return this.settings.getAll();
  }

  @Roles('admin')
  @Put()
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.settings.update(dto.patch, user?.sub ?? null);
  }
}
