import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.service';

/**
 * Full auth round trip against a real database.
 *
 * Prerequisites: `docker compose up -d` and `pnpm prisma migrate deploy`.
 */
const TEST_EMAIL = 'auth-e2e@example.com';
const CUSTOMER_EMAIL = 'auth-e2e-customer@example.com';
const TEST_PASSWORD = 'test-password-123';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let customerId: string;
  const resetTokens: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Capture the raw reset token the service would email, so the reset leg
      // of the flow can be exercised without an SMTP server or log scraping.
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: (_to: string, rawToken: string) => {
          resetTokens.push(rawToken);
          return Promise.resolve();
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts so the routes under test match the ones we ship.
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const branch = await prisma.branch.upsert({
      where: { id: 'e2e-branch' },
      update: {},
      create: { id: 'e2e-branch', name: 'E2E Branch' },
    });

    const department = await prisma.department.upsert({
      where: { id: 'e2e-department' },
      update: {},
      create: { id: 'e2e-department', name: 'E2E Department', branchId: branch.id },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash, isActive: true, branchId: branch.id, departmentId: department.id },
      create: {
        email: TEST_EMAIL,
        passwordHash,
        role: 'admin',
        branchId: branch.id,
        departmentId: department.id,
      },
    });
    userId = user.id;

    const customer = await prisma.customer.upsert({
      where: { email: CUSTOMER_EMAIL },
      update: { passwordHash, isActive: true },
      create: { email: CUSTOMER_EMAIL, passwordHash, displayName: 'E2E Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.passwordResetToken.deleteMany({ where: { OR: [{ userId }, { customerId }] } });
    await prisma.refreshToken.deleteMany({ where: { OR: [{ userId }, { customerId }] } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.customer.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    await prisma.department.deleteMany({ where: { id: 'e2e-department' } });
    await prisma.branch.deleteMany({ where: { id: 'e2e-branch' } });
    await app.close();
  });

  // The rate limiter is in-memory and app-scoped; reset it so one test's
  // request volume cannot trip another.
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

  function login(email = TEST_EMAIL, password = TEST_PASSWORD) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  }

  it('rejects a bad password with 401', async () => {
    await login(TEST_EMAIL, 'wrong-password-abc').expect(401);
  });

  it('rejects a malformed body with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('issues an access and refresh token on valid staff credentials', async () => {
    const response = await login().expect(200);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String) as string,
      refreshToken: expect.any(String) as string,
      user: {
        sub: userId,
        email: TEST_EMAIL,
        role: 'admin',
        userType: 'staff',
        branchId: 'e2e-branch',
        departmentId: 'e2e-department',
      },
    });
  });

  it('accepts the access token on a guarded route and echoes tenant scoping', async () => {
    const { body } = await login().expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken as string}`)
      .expect(200);

    expect(me.body).toMatchObject({
      sub: userId,
      userType: 'staff',
      branchId: 'e2e-branch',
      departmentId: 'e2e-department',
    });
  });

  it('rejects a guarded route without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rotates the pair on refresh and invalidates the presented token', async () => {
    const { body: first } = await login().expect(200);

    const { body: rotated } = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
  });

  it('makes the refresh token unusable after logout', async () => {
    const { body } = await login().expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: body.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken })
      .expect(401);
  });

  it('runs the full login → refresh → logout cycle for a customer', async () => {
    const { body: session } = await login(CUSTOMER_EMAIL).expect(200);
    expect(session.user).toMatchObject({
      sub: customerId,
      email: CUSTOMER_EMAIL,
      userType: 'customer',
      role: '',
      branchId: null,
    });

    const { body: rotated } = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(rotated.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
  });

  it("blocks a customer JWT from a @UserTypes('staff') endpoint but lets staff through", async () => {
    const { body: staff } = await login().expect(200);
    const { body: customer } = await login(CUSTOMER_EMAIL).expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/staff-area')
      .set('Authorization', `Bearer ${staff.accessToken as string}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/staff-area')
      .set('Authorization', `Bearer ${customer.accessToken as string}`)
      .expect(403);
  });

  it('runs forgot-password → reset-password for a customer and revokes old sessions', async () => {
    const { body: oldSession } = await login(CUSTOMER_EMAIL).expect(200);
    resetTokens.length = 0;

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: CUSTOMER_EMAIL })
      .expect(202);

    expect(resetTokens).toHaveLength(1);
    const rawToken = resetTokens[0];
    const newPassword = 'a-fresh-customer-password';

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword })
      .expect(204);

    // Old refresh token no longer works.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldSession.refreshToken })
      .expect(401);

    // New password works, old one does not.
    await login(CUSTOMER_EMAIL, newPassword).expect(200);
    await login(CUSTOMER_EMAIL, TEST_PASSWORD).expect(401);

    // Reusing the burnt reset token fails with the generic message.
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'another-one-entirely' })
      .expect(400);

    // Restore the shared password for any later run.
    await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS) },
    });
  });

  it('always answers forgot-password with 202, even for an unknown email', async () => {
    resetTokens.length = 0;
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'no-such-person@example.com' })
      .expect(202);
    expect(resetTokens).toHaveLength(0);
  });

  it('rate-limits repeated login attempts from one IP', async () => {
    const limit = 10;
    let sawTooMany = false;

    for (let i = 0; i < limit + 3; i += 1) {
      const res = await login(TEST_EMAIL, 'wrong-password-abc');
      if (res.status === 429) {
        sawTooMany = true;
        break;
      }
    }

    expect(sawTooMany).toBe(true);
  });

  it('writes an audit row for the login with the password redacted', async () => {
    await login().expect(200);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'POST /api/v1/auth/login' },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry).not.toBeNull();
    expect(entry?.resourceType).toBe('auth');
    expect(entry?.actorUserId).toBeNull();
    expect(JSON.stringify(entry?.metadata)).not.toContain(TEST_PASSWORD);
    expect(JSON.stringify(entry?.metadata)).toContain('[REDACTED]');
  });

  it('reports database health', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
