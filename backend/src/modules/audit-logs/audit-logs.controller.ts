import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogsService, type PaginatedAuditLogs } from './audit-logs.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserTypes } from '../auth/decorators/user-type.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * The audit trail, read-only (SCRUM-35).
 *
 * Guards are the same stack as `UsersController`: `JwtAuthGuard` and
 * `UserTypeGuard` are global, so `@UserTypes('staff')` is what turns a
 * customer's request into a 403; `RolesGuard` is still opt-in, so it is added
 * here and `@Roles('admin')` sits on the class. The trail names who did what to
 * whom — it is exactly what an agent has no business reading and what an
 * attacker wants first.
 *
 * There is no write route here and there should never be one. Every row comes
 * from the global `AuditLogInterceptor`; a trail its subjects can edit is not an
 * audit trail.
 *
 * Do NOT add `@UseInterceptors(AuditLogInterceptor)` — it is registered globally
 * and this would double-log. It also ignores reads (see `MUTATING_METHODS`), so
 * this endpoint does not audit itself and paging through the trail cannot flood
 * it with rows about being read.
 */
@UseGuards(RolesGuard)
@UserTypes('staff')
@Roles('admin')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(@Query() query: ListAuditLogsQueryDto): Promise<PaginatedAuditLogs> {
    return this.auditLogs.list(query);
  }
}
