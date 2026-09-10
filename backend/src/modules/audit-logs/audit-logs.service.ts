import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_LOGS_PAGE_SIZE, AUDIT_LOG_ERROR_CODES } from './audit-logs.constants';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/** The API shape for one audit row. */
export interface AuditLogResponse {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  branchId: string | null;
  departmentId: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
}

export interface PaginatedAuditLogs {
  items: AuditLogResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * The columns every read returns.
 *
 * Explicit rather than a whole row, for the same reason `USER_SELECT` is: a
 * column added to `AuditLog` later stays invisible to the API until someone
 * decides it should be public, instead of leaking the moment it is added.
 */
const AUDIT_LOG_SELECT = {
  id: true,
  actorUserId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  branchId: true,
  departmentId: true,
  statusCode: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

type SelectedAuditLog = Pick<AuditLog, keyof typeof AUDIT_LOG_SELECT>;

/**
 * Read-only access to the audit trail (SCRUM-35).
 *
 * This service never writes. `AuditLogInterceptor` owns every insert, and the
 * column shape it produces is a contract this module only consumes.
 *
 * There is deliberately no join to `User`. `AuditLog.actorUserId` is a nullable,
 * free-form string with no foreign key: the interceptor writes `null` for an
 * unauthenticated mutation, and a row outlives the user it names, which is the
 * point of an audit trail. Joining would either drop those rows or need a
 * relation the schema does not declare, so the raw id is returned and the
 * frontend resolves display names itself.
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQueryDto): Promise<PaginatedAuditLogs> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? AUDIT_LOGS_PAGE_SIZE;

    const where = buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: AUDIT_LOG_SELECT,
        // Newest first, the only ordering this endpoint offers. It is also the
        // one the `createdAt` index serves, so deep pages stay cheap. `id` is
        // the tie-break: two rows written in the same millisecond would
        // otherwise be free to swap places between page 1 and page 2, and a
        // paginated audit trail that drops a row is worse than a slow one.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map(toResponse),
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }
}

/**
 * Turn the query into a Prisma filter.
 *
 * Every clause is added only when a value was actually sent. Writing
 * `actorUserId: undefined` next to a nullable column is one refactor away from
 * `actorUserId: null`, which silently narrows the trail to the anonymous rows
 * instead of widening it to all of them.
 */
function buildWhere(query: ListAuditLogsQueryDto): Prisma.AuditLogWhereInput {
  const createdAt = buildDateRange(query.from, query.to);

  return {
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.resourceType ? { resourceType: query.resourceType } : {}),
    ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.q
      ? {
          OR: [
            { action: { contains: query.q, mode: 'insensitive' as const } },
            { resourceType: { contains: query.q, mode: 'insensitive' as const } },
            { resourceId: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

/**
 * Both bounds are inclusive. An inverted range is refused rather than quietly
 * returning nothing: an empty audit screen reads as nobody having done
 * anything, which is the most misleading answer this endpoint could give.
 */
function buildDateRange(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | null {
  if (!from && !to) {
    return null;
  }

  const gte = from ? new Date(from) : undefined;
  const lte = to ? new Date(to) : undefined;

  if (gte && lte && gte.getTime() > lte.getTime()) {
    throw new BadRequestException(AUDIT_LOG_ERROR_CODES.invalidDateRange);
  }

  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/**
 * `createdAt` is serialised here rather than left to the JSON serialiser, so the
 * wire shape is the same whatever is doing the encoding, for the same reason
 * `UsersService` does it.
 *
 * `metadata` is passed through untouched. The interceptor has already redacted
 * the sensitive keys and replaced an oversized body with the literal string
 * `[TRUNCATED]`; reshaping it here would only risk disagreeing with what was
 * actually recorded.
 */
function toResponse(row: SelectedAuditLog): AuditLogResponse {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    branchId: row.branchId,
    departmentId: row.departmentId,
    statusCode: row.statusCode,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
