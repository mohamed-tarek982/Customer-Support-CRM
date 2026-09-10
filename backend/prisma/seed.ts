/**
 * Local development seed.
 *
 * Creates one branch, one department and one admin user so the JWT and audit-log
 * smoke tests have something to run against.
 *
 * The seeded password comes from SEED_ADMIN_PASSWORD and defaults to `changeme`.
 * This is for LOCAL SMOKE TESTS ONLY — never run this against staging or
 * production, and never promote a seeded account to a real environment.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';
  // The staff UI lists users by name (SCRUM-34); without one the seeded
  // account renders as "Unnamed user" on its own admin page.
  const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Seed Admin';

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-hq' },
    update: {},
    create: { id: 'seed-branch-hq', name: 'Head Office' },
  });

  const department = await prisma.department.upsert({
    where: { id: 'seed-dept-support' },
    update: {},
    create: {
      id: 'seed-dept-support',
      name: 'Customer Support',
      branchId: branch.id,
    },
  });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'admin',
      name: SEED_ADMIN_NAME,
      branchId: branch.id,
      departmentId: department.id,
    },
    create: {
      email,
      name: SEED_ADMIN_NAME,
      passwordHash,
      role: 'admin',
      branchId: branch.id,
      departmentId: department.id,
    },
  });

  const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? 'customer@example.com';
  const customer = await prisma.customer.upsert({
    where: { email: customerEmail },
    update: { passwordHash, isActive: true },
    create: { email: customerEmail, passwordHash, displayName: 'Demo Customer' },
  });

  // Org-wide settings (SCRUM-36). Upserted by key so re-running the seed never
  // overwrites a value an admin has already changed in the UI.
  const settings: { key: string; value: unknown; category: string }[] = [
    { key: 'org.name', value: 'CRM', category: 'general' },
    { key: 'org.timezone', value: 'UTC', category: 'general' },
    { key: 'org.defaultLocale', value: 'en', category: 'localisation' },
    { key: 'org.dateFormat', value: 'yyyy-MM-dd', category: 'localisation' },
    { key: 'features.customerPortal', value: true, category: 'features' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value as never,
        category: setting.category,
      },
    });
  }

  console.log('[seed] branch    :', branch.name, `(${branch.id})`);
  console.log('[seed] department:', department.name, `(${department.id})`);
  console.log('[seed] admin     :', admin.email, `(role=${admin.role})`);
  console.log('[seed] customer  :', customer.email, '(portal user)');
  console.log('[seed] settings  :', settings.length, 'org-wide keys');
  console.log('[seed] password  :', password, '<- local smoke tests only');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('[seed] failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
