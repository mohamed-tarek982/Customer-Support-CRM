import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.service';

/**
 * Reading the audit trail against a real database (SCRUM-35).
 *
 * Prerequisites: `docker compose up -d` and `pnpm prisma migrate deploy`.
 *
 * Three assertions here carry the story's weight and cannot be checked against a
 * mocked Prisma:
 *   - an agent and a customer get 403 (RolesGuard against real tokens),
 *   - `GET /audit-logs` writes no audit row about itself, which is what stops an
 *     admin paging through the trail from burying it,
 *   - `contains` and the date range actually behave that way in Postgres.
 *
 * The suite seeds its own rows with a resourceType no other module writes, so
 * the filter assertions are facts about the seeded data rather than about
 * whatever else happens to be in the table when the suite runs.
 */
const ADMIN_EMAIL = 'audit-e2e-admin@example.com';
const AGENT_EMAIL = 'audit-e2e-agent@example.com';
const CUSTOMER_EMAIL = 'audit-e2e-customer@example.com';
const TEST_PASSWORD = 'test-password-123';

/** Unique to this suite, so every filter assertion can scope to it. */
const RESOURCE_TYPE = 'audit-e2e-widgets';

const ALL_EMAILS = [ADMIN_EMAIL, AGENT_EMAIL];

const OLD = new Date('2026-01-15T10:00:00.000Z');
const MID = new Date('2026-06-15T10:00:00.000Z');
const NEW = new Date('2026-08-15T10:00:00.000Z');

describe('Audit logs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;
  let adminId: string;
  let agentId: string;

  const api = () => request(app.getHttpServer());

  async function login(email: string): Promise<string> {
    const { body } = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    return body.accessToken as string;
  }

  /** Every seeded row, scoped to this suite's resource type. */
  const seededOnly = { resourceType: RESOURCE_TYPE };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    const seed = async (email: string, role: string) =>
      prisma.user.upsert({
        where: { email },
        update: { passwordHash, role, isActive: true, deactivatedAt: null, deactivatedById: null },
        create: { email, passwordHash, role, name: email },
      });

    adminId = (await seed(ADMIN_EMAIL, 'admin')).id;
    agentId = (await seed(AGENT_EMAIL, 'agent')).id;

    await prisma.customer.upsert({
      where: { email: CUSTOMER_EMAIL },
      update: { passwordHash, isActive: true },
      create: { email: CUSTOMER_EMAIL, passwordHash, displayName: 'Audit E2E Customer' },
    });

    // Leftovers from a previous run would make the count assertions wrong.
    await prisma.auditLog.deleteMany({ where: seededOnly });

    // Written directly rather than by making real requests: the interceptor
    // stamps `createdAt` with now(), and the range filter needs rows that are
    // months apart. This is the read side's test, not the write side's.
    await prisma.auditLog.createMany({
      data: [
        {
          actorUserId: adminId,
          action: 'POST /api/v1/audit-e2e-widgets',
          resourceType: RESOURCE_TYPE,
          resourceId: 'widget-1',
          statusCode: 201,
          metadata: { ip: '127.0.0.1', body: { name: 'First widget' } },
          createdAt: OLD,
        },
        {
          actorUserId: agentId,
          action: 'PATCH /api/v1/audit-e2e-widgets/:id',
          resourceType: RESOURCE_TYPE,
          resourceId: 'widget-1',
          statusCode: 200,
          metadata: { ip: '127.0.0.1', body: '[TRUNCATED]' },
          createdAt: MID,
        },
        {
          // Anonymous, as the interceptor writes it for POST /auth/login.
          actorUserId: null,
          action: 'DELETE /api/v1/audit-e2e-widgets/:id',
          resourceType: RESOURCE_TYPE,
          resourceId: 'widget-2',
          statusCode: 204,
          metadata: { ip: '127.0.0.1', body: null },
          createdAt: NEW,
        },
      ],
    });

    adminToken = await login(ADMIN_EMAIL);
    agentToken = await login(AGENT_EMAIL);
    customerToken = await login(CUSTOMER_EMAIL);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: seededOnly });

    for (const email of ALL_EMAILS) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    }

    for (const email of ALL_EMAILS) {
      await prisma.user.deleteMany({ where: { email } });
    }

    const customer = await prisma.customer.findUnique({ where: { email: CUSTOMER_EMAIL } });
    if (customer) {
      await prisma.refreshToken.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }

    await app.close();
  });

  // The rate limiter is in-memory, app-scoped and set to 10 requests a minute.
  // This suite makes many more than that, so reset it between tests exactly as
  // the users and auth suites do; otherwise a later assertion fails with a 429
  // that has nothing to do with what it was testing.
  beforeEach(() => {
    const storage = app.get<{ storage?: unknown }>(ThrottlerStorage, { strict: false });
    const bucket = storage.storage;
    if (bucket instanceof Map) {
      bucket.clear();
    } else if (bucket && typeof bucket === 'object') {
      for (const key of Object.keys(bucket)) {
        delete (bucket as Record<string, unknown>)[key];
      }
    }
  });

  describe('authorization', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await api().get('/api/v1/audit-logs').expect(401);
    });

    it('refuses a non-admin staff member with 403', async () => {
      await api()
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);
    });

    it('refuses a portal customer with 403', async () => {
      await api()
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('exposes no write route, so the trail cannot be edited over HTTP', async () => {
      for (const method of ['post', 'patch', 'delete'] as const) {
        await api()
          [method]('/api/v1/audit-logs')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);
      }
    });
  });

  describe('GET /audit-logs', () => {
    it('returns a paginated page to an admin', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.total).toBe(3);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.totalPages).toBe(1);
      expect(body.items).toHaveLength(3);
    });

    it('returns the columns the page renders, dates as ISO strings', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}&resourceId=widget-2`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.items[0]).toMatchObject({
        action: 'DELETE /api/v1/audit-e2e-widgets/:id',
        resourceType: RESOURCE_TYPE,
        resourceId: 'widget-2',
        statusCode: 204,
        createdAt: NEW.toISOString(),
      });
    });

    it('orders newest first', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stamps = body.items.map((item: { createdAt: string }) => item.createdAt);
      expect(stamps).toEqual([NEW.toISOString(), MID.toISOString(), OLD.toISOString()]);
    });

    it('keeps the anonymous row, with a null actor', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}&resourceId=widget-2`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].actorUserId).toBeNull();
    });

    it('hands back a truncated metadata body verbatim', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}&action=PATCH`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.items[0].metadata.body).toBe('[TRUNCATED]');
    });

    it('rejects an unknown filter rather than silently widening the query', async () => {
      await api()
        .get('/api/v1/audit-logs?nope=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects a page size above the cap', async () => {
      await api()
        .get('/api/v1/audit-logs?pageSize=1000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('filters', () => {
    const listing = async (query: string) => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?resourceType=${RESOURCE_TYPE}&${query}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return body as { total: number; items: { actorUserId: string | null; action: string }[] };
    };

    it('filters by actor', async () => {
      const body = await listing(`actorUserId=${adminId}`);

      expect(body.total).toBe(1);
      expect(body.items[0]?.actorUserId).toBe(adminId);
    });

    it('filters by action substring, case-insensitively', async () => {
      const body = await listing('action=patch');

      expect(body.total).toBe(1);
      expect(body.items[0]?.action).toContain('PATCH');
    });

    it('filters by free text across the resource columns', async () => {
      const body = await listing('q=widget-1');

      expect(body.total).toBe(2);
    });

    it('filters by an inclusive date range', async () => {
      const body = await listing(`from=${MID.toISOString()}&to=${NEW.toISOString()}`);

      expect(body.total).toBe(2);
    });

    it('includes a row that sits exactly on a bound', async () => {
      const body = await listing(`from=${MID.toISOString()}&to=${MID.toISOString()}`);

      expect(body.total).toBe(1);
    });

    it('refuses an inverted range with 400 rather than an empty page', async () => {
      const { body } = await api()
        .get(`/api/v1/audit-logs?from=${NEW.toISOString()}&to=${OLD.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(body.message).toBe('INVALID_DATE_RANGE');
    });

    it('pages through the trail', async () => {
      const body = await listing('page=2&pageSize=2');

      expect(body.total).toBe(3);
      expect(body.items).toHaveLength(1);
    });
  });

  describe('the read does not audit itself', () => {
    it('writes no row for GET /audit-logs, so paging cannot flood the trail', async () => {
      // This is the assertion the whole endpoint depends on. An audited read
      // would add a row per page view, and an admin scrolling the trail would
      // push the rows they came to see off the first page.
      const before = await prisma.auditLog.count();

      for (let i = 0; i < 3; i += 1) {
        await api()
          .get('/api/v1/audit-logs')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      }

      // The interceptor writes asynchronously off the response, so give a
      // mistaken write a chance to land before declaring there was none.
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(await prisma.auditLog.count()).toBe(before);
    });
  });
});
