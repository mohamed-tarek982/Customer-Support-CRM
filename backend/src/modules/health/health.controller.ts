import { Controller, Get } from '@nestjs/common';
import { HealthCronService } from './health-cron.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: HealthCronService,
  ) {}

  @Public()
  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    database: 'up' | 'down';
    cronTicks: number;
    timestamp: string;
  }> {
    let database: 'up' | 'down' = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      cronTicks: this.cron.ticks,
      timestamp: new Date().toISOString(),
    };
  }
}
