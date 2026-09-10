import { BadRequestException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AUDIT_LOG_ERROR_CODES } from './audit-logs.constants';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Prisma is mocked rather than hit. What this story is buying is the mapping
 * from a query string to a `where` clause, and every way that mapping can be
 * wrong — a dropped filter, a filter that collapses to `null`, an inverted date
 * range that returns an empty page instead of an error — is wrong without a
 * database being involved.
 *
 * The assertions read the arguments off the `findMany` spy, so a regression that
 * builds the right filter and then forgets to pass it cannot pass the suite.
 */
describe('AuditLogsService', () => {
  const NOW = new Date('2026-09-10T12:00:00.000Z');

  const ROW = {
    id: 'log-1',
    actorUserId: 'admin-1',
    action: 'POST /api/v1/users',
    resourceType: 'users',
    resourceId: 'user-9',
    branchId: 'branch-1',
    departmentId: 'dept-1',
    statusCode: 201,
    metadata: { ip: '127.0.0.1', body: { email: 'a@b.com' } },
    createdAt: NOW,
  };

  let findMany: jest.Mock;
  let count: jest.Mock;
  let prisma: PrismaService;
  let service: AuditLogsService;

  /** The `where` the service handed Prisma for a given query. */
  async function whereFor(query: Record<string, unknown>) {
    await service.list(query);
    return (findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
  }

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([ROW]);
    count = jest.fn().mockResolvedValue(1);

    const client = { auditLog: { findMany, count } };

    prisma = {
      ...client,
      $transaction: (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: typeof client) => Promise<unknown>)(client)
          : Promise.all(arg as Promise<unknown>[]),
    } as unknown as PrismaService;

    service = new AuditLogsService(prisma);
  });

  describe('response shape', () => {
    it('serialises the row the frontend renders, dates as ISO strings', async () => {
      const result = await service.list({});

      expect(result.items).toEqual([
        {
          id: 'log-1',
          actorUserId: 'admin-1',
          action: 'POST /api/v1/users',
          resourceType: 'users',
          resourceId: 'user-9',
          branchId: 'branch-1',
          departmentId: 'dept-1',
          statusCode: 201,
          metadata: { ip: '127.0.0.1', body: { email: 'a@b.com' } },
          createdAt: '2026-09-10T12:00:00.000Z',
        },
      ]);
    });

    it('passes an anonymous row through with a null actor rather than hiding it', async () => {
      // The interceptor writes `actorUserId: null` for POST /auth/login. Those
      // rows are the failed sign-in attempts — the last thing an audit read
      // should filter out on its own.
      findMany.mockResolvedValue([{ ...ROW, actorUserId: null, resourceId: null }]);

      const result = await service.list({});

      expect(result.items[0]?.actorUserId).toBeNull();
      expect(result.items[0]?.resourceId).toBeNull();
    });

    it('hands a truncated metadata body back verbatim, without trying to parse it', async () => {
      findMany.mockResolvedValue([{ ...ROW, metadata: { ip: null, body: '[TRUNCATED]' } }]);

      const result = await service.list({});

      expect(result.items[0]?.metadata).toEqual({ ip: null, body: '[TRUNCATED]' });
    });

    it('normalises a missing metadata column to null', async () => {
      findMany.mockResolvedValue([{ ...ROW, metadata: null }]);

      await expect(service.list({})).resolves.toMatchObject({ items: [{ metadata: null }] });
    });

    it('orders newest first, with a stable tie-break so paging cannot drop a row', async () => {
      await service.list({});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      );
    });
  });

  describe('filters', () => {
    it('sends no filter at all when nothing was asked for', async () => {
      expect(await whereFor({})).toEqual({});
    });

    it('matches an actor exactly', async () => {
      expect(await whereFor({ actorUserId: 'admin-1' })).toEqual({ actorUserId: 'admin-1' });
    });

    it('never turns an absent actor filter into a null actor', async () => {
      // The bug this guards: `actorUserId: undefined` becoming `null` narrows
      // the trail to the anonymous rows instead of returning every row.
      expect(await whereFor({})).not.toHaveProperty('actorUserId');
    });

    it('matches an action as a case-insensitive substring', async () => {
      // The stored value is "POST /api/v1/users", so filtering on "users" has
      // to hit it. An equality match would find nothing an admin ever types.
      expect(await whereFor({ action: 'users' })).toEqual({
        action: { contains: 'users', mode: 'insensitive' },
      });
    });

    it('matches resource type and id exactly', async () => {
      expect(await whereFor({ resourceType: 'users', resourceId: 'user-9' })).toEqual({
        resourceType: 'users',
        resourceId: 'user-9',
      });
    });

    it('spreads free text across action, resource type and resource id', async () => {
      expect(await whereFor({ q: 'settings' })).toEqual({
        OR: [
          { action: { contains: 'settings', mode: 'insensitive' } },
          { resourceType: { contains: 'settings', mode: 'insensitive' } },
          { resourceId: { contains: 'settings', mode: 'insensitive' } },
        ],
      });
    });

    it('combines every filter into one where, rather than letting the last one win', async () => {
      const where = await whereFor({
        actorUserId: 'admin-1',
        action: 'POST',
        resourceType: 'users',
        resourceId: 'user-9',
        q: 'settings',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
      });

      expect(where).toEqual({
        actorUserId: 'admin-1',
        action: { contains: 'POST', mode: 'insensitive' },
        resourceType: 'users',
        resourceId: 'user-9',
        createdAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lte: new Date('2026-09-30T00:00:00.000Z'),
        },
        OR: [
          { action: { contains: 'settings', mode: 'insensitive' } },
          { resourceType: { contains: 'settings', mode: 'insensitive' } },
          { resourceId: { contains: 'settings', mode: 'insensitive' } },
        ],
      });
    });

    it('applies the same where to the count, so the total matches the page', async () => {
      await service.list({ actorUserId: 'admin-1' });

      expect(count).toHaveBeenCalledWith({ where: { actorUserId: 'admin-1' } });
    });
  });

  describe('date range', () => {
    it('takes an open lower bound on its own', async () => {
      expect(await whereFor({ from: '2026-09-01T00:00:00.000Z' })).toEqual({
        createdAt: { gte: new Date('2026-09-01T00:00:00.000Z') },
      });
    });

    it('takes an open upper bound on its own', async () => {
      expect(await whereFor({ to: '2026-09-30T00:00:00.000Z' })).toEqual({
        createdAt: { lte: new Date('2026-09-30T00:00:00.000Z') },
      });
    });

    it('adds no createdAt clause when neither bound was sent', async () => {
      expect(await whereFor({})).not.toHaveProperty('createdAt');
    });

    it('accepts a range whose bounds are the same instant', async () => {
      await expect(
        service.list({ from: '2026-09-10T12:00:00.000Z', to: '2026-09-10T12:00:00.000Z' }),
      ).resolves.toBeTruthy();
    });

    it('refuses an inverted range instead of returning an empty trail', async () => {
      // Silently answering "no activity" to a mistyped range is the most
      // misleading thing this endpoint could do, so it is a 400.
      await expect(
        service.list({ from: '2026-09-30T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses it with a code the UI can translate, not an English sentence', async () => {
      await expect(
        service.list({ from: '2026-09-30T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
      ).rejects.toThrow(AUDIT_LOG_ERROR_CODES.invalidDateRange);
    });

    it('never reaches the database on an inverted range', async () => {
      await expect(
        service.list({ from: '2026-09-30T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('defaults to the first page at the shared page size', async () => {
      await service.list({});

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
    });

    it('turns a page number into an offset', async () => {
      await service.list({ page: 3, pageSize: 10 });

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });

    it('echoes the page it served, so the client footer cannot drift', async () => {
      count.mockResolvedValue(90);

      await expect(service.list({ page: 3, pageSize: 10 })).resolves.toMatchObject({
        page: 3,
        pageSize: 10,
        total: 90,
      });
    });

    it('rounds a partial last page up rather than losing it', async () => {
      count.mockResolvedValue(91);

      await expect(service.list({ page: 1, pageSize: 10 })).resolves.toMatchObject({
        totalPages: 10,
      });
    });

    it('reports zero pages for an empty trail, not one empty page', async () => {
      count.mockResolvedValue(0);
      findMany.mockResolvedValue([]);

      await expect(service.list({})).resolves.toMatchObject({ total: 0, totalPages: 0, items: [] });
    });
  });
});
