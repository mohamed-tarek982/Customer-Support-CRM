import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Only state-changing verbs are audited. Reads are far too noisy to store. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Never persisted, at any nesting depth. Matched case-insensitively. */
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'apikey',
]);

/** Route segments that are versioning noise rather than a resource name. */
const PREFIX_SEGMENTS = new Set(['api', 'v1']);

const MAX_METADATA_BYTES = 8_000;
const REDACTED = '[REDACTED]';

/**
 * Writes one AuditLog row per successful mutating request.
 *
 * Consumed by SCRUM-35 — the column shape here is a contract, so add fields
 * rather than renaming them.
 *
 * Two deliberate behaviours:
 *   - An unauthenticated mutation (POST /auth/login is the everyday case) is
 *     still recorded, with `actorUserId: null`. That is expected, not an error.
 *   - A failed audit write never fails the request it is auditing. Losing an
 *     audit row is bad; rejecting a request the user already completed is worse.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<Response>();
          void this.write(request, response.statusCode);
        },
      }),
    );
  }

  private async write(
    request: Request & { user?: AuthenticatedUser },
    statusCode: number,
  ): Promise<void> {
    try {
      const routePath = this.routePath(request);
      const user = request.user;

      await this.prisma.auditLog.create({
        data: {
          actorUserId: user?.sub ?? null,
          action: `${request.method} ${routePath}`,
          resourceType: this.resourceType(routePath),
          resourceId: this.resourceId(request),
          branchId: user?.branchId ?? null,
          departmentId: user?.departmentId ?? null,
          statusCode,
          metadata: this.buildMetadata(request),
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write audit log for ${request.method} ${request.url}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Prefers the matched route pattern (`/users/:id`) over the concrete URL. */
  private routePath(request: Request): string {
    const matched = (request as { route?: { path?: string } }).route?.path;
    if (matched) {
      return matched;
    }
    const [path] = request.originalUrl.split('?');
    return path ?? request.url;
  }

  private resourceType(routePath: string): string {
    const segment = routePath
      .split('/')
      .filter(Boolean)
      .find((part) => !PREFIX_SEGMENTS.has(part.toLowerCase()) && !part.startsWith(':'));

    return segment ?? 'unknown';
  }

  private resourceId(request: Request): string | null {
    const params = request.params as Record<string, string | undefined>;
    return params['id'] ?? params['key'] ?? null;
  }

  private buildMetadata(request: Request): Prisma.InputJsonValue {
    const body = this.sanitize(request.body) as Record<string, unknown> | null;

    const metadata: Record<string, unknown> = {
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
      body,
    };

    // Guard against a large payload bloating the audit table.
    if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
      metadata.body = '[TRUNCATED]';
    }

    return metadata as Prisma.InputJsonValue;
  }

  /** Recursively strips sensitive keys. Arrays and nested objects included. */
  private sanitize(value: unknown, depth = 0): unknown {
    if (depth > 6 || value === null || value === undefined) {
      return value ?? null;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, depth + 1));
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return `[Buffer ${value.length} bytes]`;
    }

    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : this.sanitize(item, depth + 1);
    }

    return result;
  }
}
