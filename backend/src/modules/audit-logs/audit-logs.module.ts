import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Audit-trail reading (SCRUM-35).
 *
 * `AuthModule` is imported for `RolesGuard`, which the controller opts into.
 * `PrismaModule` is global (see prisma.module.ts), so it is not listed here.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
