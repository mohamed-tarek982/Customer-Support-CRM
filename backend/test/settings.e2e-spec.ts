import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.service';

/**
 * Org-wide settings against a real database (SCRUM-36).
 *
 * Prerequisites: `docker compose up -d` and `pnpm prisma migrate deploy`.
 *
 * The load-bearing assertion is the last one in the "admin" block: a GET after a
 * PUT, on the same running server, returns the new value. That is the acceptance
 * criterion "changes take effect without a restart", expressed as a test.
 */
const ADMIN_EMAIL = 'settings-e2e-admin@example.com';
const AGENT_EMAIL = 'settings-e2e-agent@example.com';
const TEST_PASSWORD = 'test-password-123';

describe('Settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let agentToken: string;
  let adminId: string;
  let originalOrgName: unknown;

  async function login(email: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    return body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { passwordHash, role: 'admin', isActive: true },
      create: { email: ADMIN_EMAIL, passwordHash, role: 'admin' },
    });
    adminId = admin.id;

    await prisma.user.upsert({
      where: { email: AGENT_EMAIL },
      update: { passwordHash, role: 'agent', isActive: true },
      create: { email: AGENT_EMAIL, passwordHash, role: 'agent' },
    });

    // The suite mutates org.name, so remember what was there and put it back.
    const existing = await prisma.systemSetting.findUnique({ where: { key: 'org.name' } });
    originalOrgName = existing?.value ?? null;

    await prisma.systemSetting.upsert({
      where: { key: 'org.name' },
      update: { value: 'CRM' },
      create: { key: 'org.name', value: 'CRM', category: 'general' },
    });

    adminToken = await login(ADMIN_EMAIL);
    agentToken = await login(AGENT_EMAIL);
  });

  afterAll(async () => {
    if (originalOrgName !== null) {
      await prisma.systemSetting.update({
        where: { key: 'org.name' },
        data: { value: originalOrgName as never, updatedBy: null },
      });
    } else {
      await prisma.systemSetting.deleteMany({ where: { key: 'org.name' } });
    }

    for (const email of [ADMIN_EMAIL, AGENT_EMAIL]) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    await app.close();
  });

  describe('GET /settings', () => {
    it('rejects an unauthenticated read', async () => {
      await request(app.getHttpServer()).get('/api/v1/settings').expect(401);
    });

    it('lets any authenticated staff member read the values', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(body['org.name']).toBe('CRM');
    });
  });

  describe('PUT /settings', () => {
    it('rejects an unauthenticated write', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/settings')
        .send({ patch: { 'org.name': 'Hijacked' } })
        .expect(401);
    });

    it('refuses a non-admin', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/settings')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ patch: { 'org.name': 'Agent Co' } })
        .expect(403);
    });

    it('rejects an unknown key with 400', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patch: { 'org.nope': 'x' } })
        .expect(400);
    });

    it('rejects a wrong-typed value with 400', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patch: { 'features.customerPortal': 'yes' } })
        .expect(400);
    });

    it('saves an admin change and serves it on the next read, no restart', async () => {
      const put = await request(app.getHttpServer())
        .put('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patch: { 'org.name': 'Acme Support' } })
        .expect(200);

      expect(put.body['org.name']).toBe('Acme Support');

      const get = await request(app.getHttpServer())
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(get.body['org.name']).toBe('Acme Support');

      const row = await prisma.systemSetting.findUnique({ where: { key: 'org.name' } });
      expect(row?.value).toBe('Acme Support');
      expect(row?.updatedBy).toBe(adminId);
    });

    it('writes an audit row for the change', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actorUserId: adminId, action: 'PUT /api/v1/settings' },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]?.resourceType).toBe('settings');
    });
  });
});
