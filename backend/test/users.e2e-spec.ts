import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.service';

/**
 * Admin user management against a real database (SCRUM-34).
 *
 * Prerequisites: `docker compose up -d` and `pnpm prisma migrate deploy`.
 *
 * Two assertions here carry the story's security weight and cannot be checked
 * with a mocked Prisma: an agent gets 403 on every route (RolesGuard against a
 * real token), and a deactivated user's login is refused while their refresh
 * token is already dead (the transaction in `deactivate` actually committed).
 *
 * A second admin is seeded on purpose. Without one, every last-admin path in the
 * suite would depend on whatever else the database happens to hold, and the test
 * would pass or fail based on the order the suites ran in.
 */
const ADMIN_EMAIL = 'users-e2e-admin@example.com';
const ADMIN2_EMAIL = 'users-e2e-admin2@example.com';
const AGENT_EMAIL = 'users-e2e-agent@example.com';
const CUSTOMER_EMAIL = 'users-e2e-customer@example.com';
const CREATED_EMAIL = 'users-e2e-created@example.com';
const TEST_PASSWORD = 'test-password-123';

const ALL_EMAILS = [ADMIN_EMAIL, ADMIN2_EMAIL, AGENT_EMAIL, CREATED_EMAIL];

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let admin2Token: string;
  let agentToken: string;
  let customerToken: string;
  let adminId: string;
  let admin2Id: string;
  let agentId: string;

  const api = () => request(app.getHttpServer());

  async function loginPair(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { body } = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    return { accessToken: body.accessToken as string, refreshToken: body.refreshToken as string };
  }

  async function login(email: string): Promise<string> {
    return (await loginPair(email)).accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const branch = await prisma.branch.upsert({
      where: { id: 'users-e2e-branch' },
      update: {},
      create: { id: 'users-e2e-branch', name: 'Users E2E Branch' },
    });

    await prisma.department.upsert({
      where: { id: 'users-e2e-department' },
      update: {},
      create: { id: 'users-e2e-department', name: 'Users E2E Dept', branchId: branch.id },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    const seed = async (email: string, role: string) =>
      prisma.user.upsert({
        where: { email },
        update: { passwordHash, role, isActive: true, deactivatedAt: null, deactivatedById: null },
        create: { email, passwordHash, role, name: email },
      });

    adminId = (await seed(ADMIN_EMAIL, 'admin')).id;
    admin2Id = (await seed(ADMIN2_EMAIL, 'admin')).id;
    agentId = (await seed(AGENT_EMAIL, 'agent')).id;

    await prisma.customer.upsert({
      where: { email: CUSTOMER_EMAIL },
      update: { passwordHash, isActive: true },
      create: { email: CUSTOMER_EMAIL, passwordHash, displayName: 'Users E2E Customer' },
    });

    // A leftover from a previous run would make the create test fail on a 409.
    await prisma.user.deleteMany({ where: { email: CREATED_EMAIL } });

    adminToken = await login(ADMIN_EMAIL);
    admin2Token = await login(ADMIN2_EMAIL);
    agentToken = await login(AGENT_EMAIL);
    customerToken = await login(CUSTOMER_EMAIL);
  });

  afterAll(async () => {
    for (const email of ALL_EMAILS) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      // Break the self-relation before deleting, so the order of removal within
      // this loop cannot matter.
      await prisma.user.updateMany({
        where: { deactivatedById: user.id },
        data: { deactivatedById: null },
      });
    }

    for (const email of ALL_EMAILS) {
      await prisma.user.deleteMany({ where: { email } });
    }

    const customer = await prisma.customer.findUnique({ where: { email: CUSTOMER_EMAIL } });
    if (customer) {
      await prisma.refreshToken.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }

    await prisma.department.deleteMany({ where: { id: 'users-e2e-department' } });
    await prisma.branch.deleteMany({ where: { id: 'users-e2e-branch' } });

    await app.close();
  });

  // The rate limiter is in-memory, app-scoped and set to 10 requests a minute.
  // This suite makes many more than that, so reset it between tests exactly as
  // the auth suite does; otherwise a later assertion fails with a 429 that has
  // nothing to do with what it was testing.
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
    const routes: [string, 'get' | 'post' | 'patch', string][] = [
      ['list', 'get', '/api/v1/users'],
      ['read one', 'get', '/api/v1/users/some-id'],
      ['create', 'post', '/api/v1/users'],
      ['update', 'patch', '/api/v1/users/some-id'],
      ['deactivate', 'post', '/api/v1/users/some-id/deactivate'],
      ['reactivate', 'post', '/api/v1/users/some-id/reactivate'],
      ['assign role', 'post', '/api/v1/users/some-id/role'],
    ];

    it.each(routes)('rejects an unauthenticated %s with 401', async (_name, method, path) => {
      await api()[method](path).expect(401);
    });

    it.each(routes)(
      'refuses a non-admin staff member on %s with 403',
      async (_name, method, path) => {
        await api()[method](path).set('Authorization', `Bearer ${agentToken}`).expect(403);
      },
    );

    it.each(routes)('refuses a customer on %s with 403', async (_name, method, path) => {
      await api()[method](path).set('Authorization', `Bearer ${customerToken}`).expect(403);
    });
  });

  describe('GET /users', () => {
    it('lists users without ever returning a password hash', async () => {
      const { body } = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(body.items)).toBe(true);
      expect(body.total).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item).not.toHaveProperty('passwordHash');
      }
    });

    it('filters by role', async () => {
      const { body } = await api()
        .get('/api/v1/users?role=agent&pageSize=100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.items.every((item: { role: string }) => item.role === 'agent')).toBe(true);
      expect(body.items.some((item: { id: string }) => item.id === agentId)).toBe(true);
    });

    it('searches by email fragment', async () => {
      const { body } = await api()
        .get('/api/v1/users?q=users-e2e-agent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(agentId);
    });

    it('rejects an unknown filter rather than silently widening the result', async () => {
      await api()
        .get('/api/v1/users?nope=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects an unknown role filter', async () => {
      await api()
        .get('/api/v1/users?role=superuser')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('POST /users', () => {
    let createdId: string;

    it('creates an account and returns it without the hash', async () => {
      const { body } = await api()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: CREATED_EMAIL.toUpperCase(),
          name: 'Created Person',
          role: 'agent',
          branchId: 'users-e2e-branch',
          departmentId: 'users-e2e-department',
          password: TEST_PASSWORD,
        })
        .expect(201);

      createdId = body.id;

      expect(body.email).toBe(CREATED_EMAIL);
      expect(body.isActive).toBe(true);
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('stored a bcrypt hash the new account can actually log in with', async () => {
      const row = await prisma.user.findUnique({ where: { email: CREATED_EMAIL } });

      expect(row?.passwordHash).not.toBe(TEST_PASSWORD);
      await expect(bcrypt.compare(TEST_PASSWORD, row!.passwordHash)).resolves.toBe(true);
      await expect(login(CREATED_EMAIL)).resolves.toEqual(expect.any(String));
    });

    it('wrote an audit row attributing the creation to the acting admin', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actorUserId: adminId, action: 'POST /api/v1/users' },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]?.resourceType).toBe('users');
    });

    it('never records the plaintext password in the audit metadata', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actorUserId: adminId, action: 'POST /api/v1/users' },
      });

      expect(JSON.stringify(logs)).not.toContain(TEST_PASSWORD);
    });

    it('refuses a duplicate email with 409', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: CREATED_EMAIL,
          name: 'Second Person',
          role: 'agent',
          password: TEST_PASSWORD,
        })
        .expect(409);
    });

    it('refuses an unknown role with 400', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'users-e2e-bad-role@example.com',
          name: 'Bad Role',
          role: 'superuser',
          password: TEST_PASSWORD,
        })
        .expect(400);
    });

    it('refuses a branch that does not exist with 400', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'users-e2e-bad-branch@example.com',
          name: 'Bad Branch',
          role: 'agent',
          branchId: 'no-such-branch',
          password: TEST_PASSWORD,
        })
        .expect(400);
    });

    afterAll(async () => {
      if (createdId) {
        await prisma.refreshToken.deleteMany({ where: { userId: createdId } });
        await prisma.auditLog.deleteMany({ where: { actorUserId: createdId } });
      }
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates the profile fields it was sent', async () => {
      const { body } = await api()
        .patch(`/api/v1/users/${agentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed Agent' })
        .expect(200);

      expect(body.name).toBe('Renamed Agent');
      expect(body.email).toBe(AGENT_EMAIL);
    });

    it('rejects a password sent to the profile endpoint instead of applying it', async () => {
      await api()
        .patch(`/api/v1/users/${agentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'hijacked-password' })
        .expect(400);
    });

    it('404s on an unknown id', async () => {
      await api()
        .patch('/api/v1/users/no-such-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('POST /users/:id/role', () => {
    it('promotes an agent to admin', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${agentId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' })
        .expect(201);

      expect(body.role).toBe('admin');
    });

    it('demotes them again', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${agentId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'agent' })
        .expect(201);

      expect(body.role).toBe('agent');
    });

    it('refuses an unknown role with 400', async () => {
      await api()
        .post(`/api/v1/users/${agentId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'superuser' })
        .expect(400);
    });
  });

  describe('deactivation', () => {
    /** The agent's live session, captured before they are disabled. */
    let agentRefreshToken: string;

    beforeAll(async () => {
      agentRefreshToken = (await loginPair(AGENT_EMAIL)).refreshToken;
    });

    it('refuses an admin deactivating themselves with 409', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${adminId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(body.message).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('deactivates another user and stamps who did it', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${agentId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(body.isActive).toBe(false);
      expect(body.deactivatedAt).toEqual(expect.any(String));

      const row = await prisma.user.findUnique({ where: { id: agentId } });
      expect(row?.deactivatedById).toBe(adminId);
    });

    it('revoked every live refresh token in the same transaction', async () => {
      const live = await prisma.refreshToken.count({
        where: { userId: agentId, revokedAt: null },
      });

      expect(live).toBe(0);
    });

    it('refuses the deactivated user a fresh login', async () => {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: AGENT_EMAIL, password: TEST_PASSWORD })
        .expect(401);
    });

    it('refuses to rotate the session the deactivated user was already holding', async () => {
      // This is the assertion the revocation exists for. The token still
      // verifies cryptographically, so without the revoked row the disabled
      // account would keep minting access tokens until it expired on its own.
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: agentRefreshToken })
        .expect(401);
    });

    it('reactivates them and clears both audit fields together', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${agentId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(body.isActive).toBe(true);
      expect(body.deactivatedAt).toBeNull();

      const row = await prisma.user.findUnique({ where: { id: agentId } });
      expect(row?.deactivatedById).toBeNull();
    });

    it('lets the reactivated user log in again', async () => {
      await expect(login(AGENT_EMAIL)).resolves.toEqual(expect.any(String));
    });
  });

  describe('last active admin', () => {
    /**
     * Narrows the installation down to a single active admin by disabling every
     * other one, so "the last admin" is a fact about the database rather than an
     * assumption about which rows happen to exist.
     */
    let parked: string[] = [];

    beforeAll(async () => {
      const others = await prisma.user.findMany({
        where: { role: 'admin', isActive: true, id: { notIn: [adminId] } },
        select: { id: true },
      });
      parked = others.map((row) => row.id);
      await prisma.user.updateMany({
        where: { id: { in: parked } },
        data: { isActive: false, deactivatedAt: new Date() },
      });
    });

    afterAll(async () => {
      await prisma.user.updateMany({
        where: { id: { in: parked } },
        data: { isActive: true, deactivatedAt: null, deactivatedById: null },
      });
    });

    it('refuses to deactivate the only remaining admin', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${adminId}/deactivate`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .expect(409);

      expect(body.message).toBe('LAST_ACTIVE_ADMIN');
    });

    it('refuses to demote the only remaining admin', async () => {
      const { body } = await api()
        .post(`/api/v1/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'agent' })
        .expect(409);

      expect(body.message).toBe('LAST_ACTIVE_ADMIN');
    });

    it('refuses the same demotion sent through the edit endpoint', async () => {
      await api()
        .patch(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'agent' })
        .expect(409);
    });

    it('left the admin untouched after all three refusals', async () => {
      const row = await prisma.user.findUnique({ where: { id: adminId } });

      expect(row?.role).toBe('admin');
      expect(row?.isActive).toBe(true);
    });

    it('allows the demotion again once a second admin is active', async () => {
      await prisma.user.update({ where: { id: admin2Id }, data: { isActive: true } });

      const { body } = await api()
        .post(`/api/v1/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'agent' })
        .expect(201);

      expect(body.role).toBe('agent');

      // Put it back: later assertions and other suites expect this admin to be one.
      await prisma.user.update({ where: { id: adminId }, data: { role: 'admin' } });
    });
  });
});
