import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.service';

/**
 * Round-trips a real file through the configured object store.
 *
 * This needs live Cloudflare R2 or Supabase Storage credentials in backend/.env.
 * With the placeholder credentials from .env.example the suite skips itself and
 * logs a warning rather than failing, so CI stays green on forks that have no
 * bucket. `pnpm test:e2e` on a machine with real credentials is what actually
 * proves the acceptance criterion.
 */
const TEST_EMAIL = 'storage-e2e@example.com';
const TEST_PASSWORD = 'test-password-123';
const FIXTURE = Buffer.from('storage round-trip fixture\nline two\n', 'utf8');

function credentialsLookReal(): boolean {
  const placeholders = new Set(['changeme', 'changeme-too', '', undefined]);
  return (
    !placeholders.has(process.env.S3_ACCESS_KEY_ID) &&
    !placeholders.has(process.env.S3_SECRET_ACCESS_KEY) &&
    !(process.env.S3_ENDPOINT ?? '').includes('example.')
  );
}

const describeWithStorage = credentialsLookReal() ? describe : describe.skip;

if (!credentialsLookReal()) {
  console.warn(
    '[storage.e2e] SKIPPED: S3 credentials are placeholders. ' +
      'Set S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY in backend/.env ' +
      'to run the object-storage round trip.',
  );
}

describeWithStorage('Storage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let accessToken: string;
  let uploadedKey: string | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash: await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS), isActive: true },
      create: {
        email: TEST_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS),
        role: 'admin',
      },
    });

    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);

    accessToken = body.accessToken as string;
  });

  afterAll(async () => {
    if (uploadedKey) {
      // Leaving objects behind in a shared bucket is how buckets rot.
      await storage.delete(uploadedKey).catch(() => undefined);
    }

    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (user) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    await app.close();
  });

  it('rejects an unauthenticated upload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/storage/test-upload')
      .attach('file', FIXTURE, 'fixture.txt')
      .expect(401);
  });

  it('uploads a file and downloads it back byte for byte', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/v1/storage/test-upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FIXTURE, 'fixture.txt')
      .expect(201);

    uploadedKey = upload.body.key as string;

    expect(uploadedKey.startsWith('smoke-test/')).toBe(true);
    expect(upload.body.size).toBe(FIXTURE.length);

    const download = await request(app.getHttpServer())
      .get(`/api/v1/storage/test-download/${encodeURIComponent(uploadedKey)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(Buffer.compare(download.body as Buffer, FIXTURE)).toBe(0);
  });

  it('issues a presigned download URL for the stored object', async () => {
    expect(uploadedKey).not.toBeNull();

    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/storage/test-download-url/${encodeURIComponent(uploadedKey as string)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(body.url).toContain('X-Amz-Signature');
    expect(body.expiresIn).toBe(300);
  });

  it('refuses a key outside the smoke-test prefix', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/storage/test-download/${encodeURIComponent('other/secret.txt')}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });
});
