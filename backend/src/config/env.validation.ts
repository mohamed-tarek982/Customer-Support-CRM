// Must be imported before class-transformer reads design:type metadata. main.ts
// also imports it, but validateEnv runs at module-evaluation time when AppModule
// is imported directly (Jest, scripts), where main.ts never runs.
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Every environment variable the API reads, with the validation that runs at
 * bootstrap. A missing or malformed required variable aborts startup rather
 * than surfacing as a confusing runtime failure later.
 *
 * Keep this list in sync with backend/.env.example.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // Environment variables always arrive as strings. @Type is explicit rather
  // than relying on enableImplicitConversion, which needs decorator metadata to
  // be present and silently leaves the value a string when it is not.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL = '7d';

  // --- Password reset + rate limiting (SCRUM-43) ---------------------------
  @IsString()
  @IsNotEmpty()
  PASSWORD_RESET_TTL = '1h';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_LOGIN = 10;

  /** Throttler window, in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_TTL = 60;

  // --- Mail (SCRUM-43) ----------------------------------------------------
  @IsString()
  @IsNotEmpty()
  MAIL_FROM = 'Customer Support CRM <no-reply@example.com>';

  /** When unset, MailService logs the reset link instead of sending it. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_URL?: string;

  /** Base URL of the web app, used to build links in transactional email. */
  @IsString()
  @IsNotEmpty()
  FRONTEND_BASE = 'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  S3_ENDPOINT!: string;

  @IsString()
  @IsNotEmpty()
  S3_REGION = 'auto';

  @IsString()
  @IsNotEmpty()
  S3_BUCKET!: string;

  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY_ID!: string;

  @IsString()
  @IsNotEmpty()
  S3_SECRET_ACCESS_KEY!: string;

  @IsString()
  CORS_ORIGINS = 'http://localhost:3000';
}

/** Passed to `ConfigModule.forRoot({ validate })`. Throws on the first bad value. */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration.\n${details}\n\nCopy backend/.env.example to backend/.env and fill in the missing values.`,
    );
  }

  return parsed;
}
