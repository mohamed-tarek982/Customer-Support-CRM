import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { EnvService } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { MailModule } from './modules/mail/mail.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

/**
 * ScheduleModule is skipped under NODE_ENV=test so the demo cron does not fire
 * during Jest runs and leave open handles behind.
 */
const scheduleImports = process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()];

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ...scheduleImports,
    ThrottlerModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        throttlers: [{ ttl: env.authRateLimitTtl * 1000, limit: env.authRateLimitLogin }],
      }),
    }),
    AuthModule,
    HealthModule,
    StorageModule,
    MailModule,
    SettingsModule,
    UsersModule,
  ],
  providers: [
    // Rate limiting is global; login and forgot-password additionally carry a
    // per-route @Throttle to document the brute-force protection explicitly.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
