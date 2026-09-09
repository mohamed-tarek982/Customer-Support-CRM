import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Proves @nestjs/schedule is wired correctly. That is its entire job today.
 *
 * Phase 4 adds the real jobs here — chiefly the per-minute SLA breach scan that
 * looks for overdue tickets. A cron is deliberately used instead of a job queue:
 * BullMQ/Redis is on the DEFERRED list and is only revisited if notification
 * volume outgrows what a per-minute scan can handle.
 *
 * ScheduleModule.forRoot() is skipped when NODE_ENV=test (see AppModule), so
 * this does not fire during Jest runs.
 */
@Injectable()
export class HealthCronService {
  private readonly logger = new Logger(HealthCronService.name);
  private tickCount = 0;

  @Cron(CronExpression.EVERY_MINUTE, { name: 'health-tick' })
  handleTick(): void {
    this.tickCount += 1;
    this.logger.log(`[health-cron] tick ${new Date().toISOString()}`);
  }

  /** Exposed so GET /health can report that the scheduler is actually running. */
  get ticks(): number {
    return this.tickCount;
  }
}
