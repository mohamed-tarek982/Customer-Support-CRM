import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { USER_ERROR_CODES } from './users.constants';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';

/**
 * Prisma is mocked rather than hit: what this story is buying is the guard logic
 * sitting in front of the writes — last-admin, self-deactivation, session
 * revocation on disable — and none of that needs a database to be wrong.
 *
 * The one thing the mock takes seriously is the transaction callback: the
 * last-admin count and the write it protects must run against the same client,
 * so `$transaction` hands the callback a `tx` whose `user.count` is the same spy
 * the assertions read. A mock that ignored the callback would let a regression
 * that moves the count outside the transaction pass.
 */
describe('UsersService', () => {
  const NOW = new Date('2026-09-10T12:00:00.000Z');

  const ADMIN = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Root Admin',
    role: 'admin',
    passwordHash: 'hashed',
    isActive: true,
    deactivatedAt: null,
    deactivatedById: null,
    branchId: 'branch-1',
    departmentId: 'dept-1',
    createdAt: NOW,
    updatedAt: NOW,
  };

  const AGENT = {
    ...ADMIN,
    id: 'agent-1',
    email: 'agent@example.com',
    name: 'Ann Agent',
    role: 'agent',
  };

  let findUnique: jest.Mock;
  let findMany: jest.Mock;
  let count: jest.Mock;
  let create: jest.Mock;
  let update: jest.Mock;
  let revokeMany: jest.Mock;
  let branchCount: jest.Mock;
  let departmentCount: jest.Mock;
  let hashPassword: jest.Mock;
  let prisma: PrismaService;
  let service: UsersService;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(AGENT);
    findMany = jest.fn().mockResolvedValue([ADMIN, AGENT]);
    // Two admins by default, so the last-admin guard passes unless a test says
    // otherwise. The interesting cases set this to 0 explicitly.
    count = jest.fn().mockResolvedValue(2);
    create = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...AGENT, ...data, id: 'new-1' }),
      );
    update = jest
      .fn()
      .mockImplementation(
        ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Promise.resolve({ ...AGENT, id: where.id, ...data }),
      );
    revokeMany = jest.fn().mockResolvedValue({ count: 1 });
    branchCount = jest.fn().mockResolvedValue(1);
    departmentCount = jest.fn().mockResolvedValue(1);
    hashPassword = jest.fn().mockResolvedValue('bcrypt-hash');

    const client = {
      user: { findUnique, findMany, count, create, update },
      refreshToken: { updateMany: revokeMany },
      branch: { count: branchCount },
      department: { count: departmentCount },
    };

    prisma = {
      ...client,
      $transaction: (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: typeof client) => Promise<unknown>)(client)
          : Promise.all(arg as Promise<unknown>[]),
    } as unknown as PrismaService;

    service = new UsersService(prisma, { hashPassword } as unknown as AuthService);
  });

  describe('list', () => {
    it('never selects the password hash', async () => {
      await service.list({});

      const select = findMany.mock.calls[0]?.[0].select as Record<string, boolean>;
      expect(select.passwordHash).toBeUndefined();
      expect(select.email).toBe(true);
    });

    it('omits the password hash from the response objects', async () => {
      const result = await service.list({});

      for (const item of result.items) {
        expect(item).not.toHaveProperty('passwordHash');
      }
    });

    it('searches email and name together, case-insensitively', async () => {
      await service.list({ q: 'ann' });

      expect(findMany.mock.calls[0]?.[0].where).toEqual({
        OR: [
          { email: { contains: 'ann', mode: 'insensitive' } },
          { name: { contains: 'ann', mode: 'insensitive' } },
        ],
      });
    });

    it('passes an isActive:false filter through instead of dropping it as falsy', async () => {
      await service.list({ isActive: false });

      expect(findMany.mock.calls[0]?.[0].where).toEqual({ isActive: false });
    });

    it('combines the role and tenant filters', async () => {
      await service.list({ role: 'agent', branchId: 'branch-1', departmentId: 'dept-1' });

      expect(findMany.mock.calls[0]?.[0].where).toEqual({
        role: 'agent',
        branchId: 'branch-1',
        departmentId: 'dept-1',
      });
    });

    it('translates page and pageSize into skip and take', async () => {
      await service.list({ page: 3, pageSize: 10 });

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 20, take: 10 });
    });

    it('reports the unpaginated total alongside the page', async () => {
      count.mockResolvedValue(42);

      await expect(service.list({ page: 2, pageSize: 10 })).resolves.toMatchObject({
        total: 42,
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('get', () => {
    it('returns the user without the hash', async () => {
      const result = await service.get('agent-1');

      expect(result.email).toBe('agent@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('serialises dates as ISO strings', async () => {
      await expect(service.get('agent-1')).resolves.toMatchObject({
        createdAt: NOW.toISOString(),
        deactivatedAt: null,
      });
    });

    it('404s on an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    const DTO = {
      email: 'new@example.com',
      name: 'New Person',
      role: 'agent' as const,
      branchId: 'branch-1',
      departmentId: 'dept-1',
      password: 'test-password-123',
    };

    it('hashes the password through the auth service, never storing the plaintext', async () => {
      await service.create(DTO);

      expect(hashPassword).toHaveBeenCalledWith('test-password-123');
      const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
      expect(data.passwordHash).toBe('bcrypt-hash');
      expect(data).not.toHaveProperty('password');
    });

    it('stores the tenant scoping it was given', async () => {
      await service.create(DTO);

      expect(create.mock.calls[0]?.[0].data).toMatchObject({
        branchId: 'branch-1',
        departmentId: 'dept-1',
      });
    });

    it('stores null rather than undefined when no branch was chosen', async () => {
      await service.create({ ...DTO, branchId: undefined, departmentId: undefined });

      expect(create.mock.calls[0]?.[0].data).toMatchObject({
        branchId: null,
        departmentId: null,
      });
    });

    it('keeps a non-ASCII name exactly as it was given', async () => {
      const result = await service.create({ ...DTO, name: 'محمد طارق' });

      expect(create.mock.calls[0]?.[0].data).toMatchObject({ name: 'محمد طارق' });
      expect(result.name).toBe('محمد طارق');
    });

    it('turns the unique-index violation into a 409 with a translatable code', async () => {
      create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(service.create(DTO)).rejects.toMatchObject({
        message: USER_ERROR_CODES.emailTaken,
      });
      await expect(service.create(DTO)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated Prisma error rather than reporting a duplicate email', async () => {
      create.mockRejectedValue(Object.assign(new Error('boom'), { code: 'P1001' }));

      await expect(service.create(DTO)).rejects.toThrow('boom');
    });

    it('rejects a branch that does not exist, before touching the user table', async () => {
      branchCount.mockResolvedValue(0);

      await expect(service.create(DTO)).rejects.toMatchObject({
        message: USER_ERROR_CODES.invalidBranch,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a department that does not exist', async () => {
      departmentCount.mockResolvedValue(0);

      await expect(service.create(DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('writes only the fields that were sent', async () => {
      await service.update('agent-1', { name: 'Renamed' });

      expect(update.mock.calls[0]?.[0].data).toEqual({ name: 'Renamed' });
    });

    it('clears the branch when null was sent, rather than treating it as absent', async () => {
      await service.update('agent-1', { branchId: null });

      expect(update.mock.calls[0]?.[0].data).toEqual({ branchId: null });
    });

    it('404s on an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports a duplicate email as a 409', async () => {
      update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        service.update('agent-1', { email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies the last-admin guard to a demotion sent through the edit form', async () => {
      findUnique.mockResolvedValue(ADMIN);
      count.mockResolvedValue(0);

      await expect(service.update('admin-1', { role: 'agent' })).rejects.toMatchObject({
        message: USER_ERROR_CODES.lastActiveAdmin,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('lets an admin be demoted while another active admin remains', async () => {
      findUnique.mockResolvedValue(ADMIN);
      count.mockResolvedValue(1);

      await expect(service.update('admin-1', { role: 'agent' })).resolves.toMatchObject({
        role: 'agent',
      });
    });

    it('does not run the admin count for an edit that leaves the role alone', async () => {
      findUnique.mockResolvedValue(ADMIN);

      await service.update('admin-1', { name: 'Renamed' });

      expect(count).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('refuses to disable the acting admin', async () => {
      await expect(service.deactivate('admin-1', 'admin-1')).rejects.toMatchObject({
        message: USER_ERROR_CODES.cannotDeactivateSelf,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('sets the flag and both audit fields together', async () => {
      await service.deactivate('agent-1', 'admin-1');

      const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
      expect(data.isActive).toBe(false);
      expect(data.deactivatedById).toBe('admin-1');
      expect(data.deactivatedAt).toBeInstanceOf(Date);
    });

    it('revokes every live refresh token so the disabled user cannot keep refreshing', async () => {
      await service.deactivate('agent-1', 'admin-1');

      expect(revokeMany).toHaveBeenCalledWith({
        where: { userId: 'agent-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('refuses to disable the last active admin', async () => {
      findUnique.mockResolvedValue(ADMIN);
      count.mockResolvedValue(0);

      await expect(service.deactivate('admin-1', 'other-admin')).rejects.toMatchObject({
        message: USER_ERROR_CODES.lastActiveAdmin,
      });
      expect(update).not.toHaveBeenCalled();
      expect(revokeMany).not.toHaveBeenCalled();
    });

    it('excludes the target from the admin count, since the target is being disabled', async () => {
      findUnique.mockResolvedValue(ADMIN);

      await service.deactivate('admin-1', 'other-admin');

      expect(count).toHaveBeenCalledWith({
        where: { role: 'admin', isActive: true, id: { not: 'admin-1' } },
      });
    });

    it('does not run the admin count when the target is not an admin', async () => {
      await service.deactivate('agent-1', 'admin-1');

      expect(count).not.toHaveBeenCalled();
    });

    it('is idempotent, leaving the original deactivatedAt in place', async () => {
      findUnique.mockResolvedValue({
        ...AGENT,
        isActive: false,
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.deactivate('agent-1', 'admin-1');

      expect(update).not.toHaveBeenCalled();
    });

    it('404s on an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.deactivate('nope', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('clears both deactivation fields alongside the flag', async () => {
      findUnique.mockResolvedValue({ ...AGENT, isActive: false, deactivatedAt: NOW });

      await service.reactivate('agent-1');

      expect(update.mock.calls[0]?.[0].data).toEqual({
        isActive: true,
        deactivatedAt: null,
        deactivatedById: null,
      });
    });

    it('404s on an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.reactivate('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assignRole', () => {
    it('writes the new role', async () => {
      await service.assignRole('agent-1', 'admin');

      expect(update.mock.calls[0]?.[0].data).toEqual({ role: 'admin' });
    });

    it('is a no-op when the user already holds the role', async () => {
      findUnique.mockResolvedValue(AGENT);

      await service.assignRole('agent-1', 'agent');

      expect(update).not.toHaveBeenCalled();
    });

    it('refuses to demote the last active admin', async () => {
      findUnique.mockResolvedValue(ADMIN);
      count.mockResolvedValue(0);

      await expect(service.assignRole('admin-1', 'agent')).rejects.toMatchObject({
        message: USER_ERROR_CODES.lastActiveAdmin,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('allows the demotion once a second active admin exists', async () => {
      findUnique.mockResolvedValue(ADMIN);
      count.mockResolvedValue(1);

      await expect(service.assignRole('admin-1', 'agent')).resolves.toMatchObject({
        role: 'agent',
      });
    });

    it('promotes an agent without consulting the admin count', async () => {
      await service.assignRole('agent-1', 'admin');

      expect(count).not.toHaveBeenCalled();
    });

    it('404s on an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.assignRole('nope', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
