import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthCronService } from './health-cron.service';

@Module({
  controllers: [HealthController],
  providers: [HealthCronService],
  exports: [HealthCronService],
})
export class HealthModule {}
