import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from './env.validation';

/**
 * Typed accessor over @nestjs/config.
 *
 * Inject this instead of ConfigService so nothing in the codebase reads an
 * environment variable by raw string key. `EnvironmentVariables` has already
 * been validated at bootstrap, so every getter below is non-nullable.
 */
@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get nodeEnv(): NodeEnv {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isTest(): boolean {
    return this.nodeEnv === NodeEnv.Test;
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtAccessTtl(): string {
    return this.config.get('JWT_ACCESS_TTL', { infer: true });
  }

  get jwtRefreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get jwtRefreshTtl(): string {
    return this.config.get('JWT_REFRESH_TTL', { infer: true });
  }

  get passwordResetTtl(): string {
    return this.config.get('PASSWORD_RESET_TTL', { infer: true });
  }

  /** Max login / forgot-password attempts allowed inside `authRateLimitTtl`. */
  get authRateLimitLogin(): number {
    return this.config.get('AUTH_RATE_LIMIT_LOGIN', { infer: true });
  }

  /** Throttler window, in seconds. */
  get authRateLimitTtl(): number {
    return this.config.get('AUTH_RATE_LIMIT_TTL', { infer: true });
  }

  get mailFrom(): string {
    return this.config.get('MAIL_FROM', { infer: true });
  }

  get smtpUrl(): string | undefined {
    return this.config.get('SMTP_URL', { infer: true });
  }

  get frontendBase(): string {
    return this.config.get('FRONTEND_BASE', { infer: true });
  }

  get s3Endpoint(): string {
    return this.config.get('S3_ENDPOINT', { infer: true });
  }

  get s3Region(): string {
    return this.config.get('S3_REGION', { infer: true });
  }

  get s3Bucket(): string {
    return this.config.get('S3_BUCKET', { infer: true });
  }

  get s3AccessKeyId(): string {
    return this.config.get('S3_ACCESS_KEY_ID', { infer: true });
  }

  get s3SecretAccessKey(): string {
    return this.config.get('S3_SECRET_ACCESS_KEY', { infer: true });
  }

  /**
   * False while the S3 credentials are still the .env.example placeholders.
   * The storage e2e test skips itself rather than failing when this is false.
   */
  get isStorageConfigured(): boolean {
    const placeholders = new Set(['changeme', 'changeme-too', '']);
    return (
      !placeholders.has(this.s3AccessKeyId) &&
      !placeholders.has(this.s3SecretAccessKey) &&
      !this.s3Endpoint.includes('example.')
    );
  }

  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
}
