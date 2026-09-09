import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService, BCRYPT_ROUNDS } from './auth.service';
import type { EnvService } from '../../config/env';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';
const PASSWORD = 'correct-horse-battery';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

type PrismaMock = {
  user: { findUnique: jest.Mock };
  customer: { findUnique: jest.Mock };
  refreshToken: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwt: JwtService;
  let mail: { sendPasswordReset: jest.Mock };
  let passwordHash: string;

  const baseUser = {
    id: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    isActive: true,
    branchId: 'branch-1',
    departmentId: 'dept-1',
  };

  const baseCustomer = {
    id: 'cust-1',
    email: 'customer@example.com',
    isActive: true,
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        update: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    jwt = new JwtService({});
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

    const env = {
      jwtAccessSecret: ACCESS_SECRET,
      jwtAccessTtl: '15m',
      jwtRefreshSecret: REFRESH_SECRET,
      jwtRefreshTtl: '7d',
      passwordResetTtl: '1h',
    } as unknown as EnvService;

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      env,
      mail as unknown as MailService,
    );
  });

  describe('login', () => {
    it('issues an access/refresh pair and persists the hashed refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login('admin@example.com', PASSWORD);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user).toEqual({
        sub: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
        userType: 'staff',
        branchId: 'branch-1',
        departmentId: 'dept-1',
      });

      // The raw token must never be stored, only its SHA-256 digest.
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { tokenHash: string; userId: string | null; userType: string };
      };
      expect(createArgs.data.tokenHash).toBe(sha256(result.refreshToken));
      expect(createArgs.data.userId).toBe('user-1');
      expect(createArgs.data.userType).toBe('staff');
    });

    it('returns userType "staff" and the role for an account in the users table', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const { user, accessToken } = await service.login('admin@example.com', PASSWORD);

      expect(user.userType).toBe('staff');
      expect(user.role).toBe('admin');

      const payload = await jwt.verifyAsync<{ userType: string; role: string }>(accessToken, {
        secret: ACCESS_SECRET,
      });
      expect(payload.userType).toBe('staff');
      expect(payload.role).toBe('admin');
    });

    it('returns userType "customer" and an empty role for an account only in customers', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue({ ...baseCustomer, passwordHash });

      const { user } = await service.login('customer@example.com', PASSWORD);

      expect(user.userType).toBe('customer');
      expect(user.role).toBe('');
      expect(user.branchId).toBeNull();

      const createArgs = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { userId: string | null; customerId: string | null; userType: string };
      };
      expect(createArgs.data.customerId).toBe('cust-1');
      expect(createArgs.data.userId).toBeNull();
      expect(createArgs.data.userType).toBe('customer');
    });

    it('staff wins when the same email exists in both tables', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const { user } = await service.login('admin@example.com', PASSWORD);

      expect(user.userType).toBe('staff');
      // customers is never consulted once users matches.
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    });

    it('throws the identical error for unknown email, wrong staff password and wrong customer password', async () => {
      const messages: string[] = [];

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);
      await service
        .login('nobody@example.com', PASSWORD)
        .catch((e: Error) => messages.push(e.message));

      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
      await service
        .login('admin@example.com', 'wrong')
        .catch((e: Error) => messages.push(e.message));

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue({ ...baseCustomer, passwordHash });
      await service
        .login('customer@example.com', 'wrong')
        .catch((e: Error) => messages.push(e.message));

      expect(messages).toEqual([
        'Invalid credentials',
        'Invalid credentials',
        'Invalid credentials',
      ]);
    });

    it('rejects an unknown email with UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', PASSWORD)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a deactivated staff account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash, isActive: false });
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.login('admin@example.com', PASSWORD)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    function signRefreshToken(
      expiresIn: JwtSignOptions['expiresIn'] = '7d',
      userType: 'staff' | 'customer' = 'staff',
    ): Promise<string> {
      return jwt.signAsync(
        { sub: userType === 'customer' ? 'cust-1' : 'user-1', jti: 'jti-1', userType },
        { secret: REFRESH_SECRET, expiresIn },
      );
    }

    function liveStaffRow() {
      return {
        id: 'rt-1',
        userType: 'staff',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { ...baseUser, passwordHash },
        customer: null,
      };
    }

    function liveCustomerRow() {
      return {
        id: 'rt-2',
        userType: 'customer',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: null,
        customer: { ...baseCustomer, passwordHash },
      };
    }

    it('rotates a valid staff token: revokes the old row and issues a new pair', async () => {
      const token = await signRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue(liveStaffRow());

      const result = await service.refresh(token);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result.refreshToken).not.toBe(token);
    });

    it('re-issues against the customers table when the stored row is a customer session', async () => {
      const token = await signRefreshToken('7d', 'customer');
      prisma.refreshToken.findUnique.mockResolvedValue(liveCustomerRow());

      const { accessToken } = await service.refresh(token);
      const payload = await jwt.verifyAsync<{ userType: string; sub: string }>(accessToken, {
        secret: ACCESS_SECRET,
      });

      expect(payload.userType).toBe('customer');
      expect(payload.sub).toBe('cust-1');
      const createArgs = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { customerId: string | null; userType: string };
      };
      expect(createArgs.data.customerId).toBe('cust-1');
      expect(createArgs.data.userType).toBe('customer');
    });

    it('looks the token up by digest with both relations', async () => {
      const token = await signRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue(liveStaffRow());

      await service.refresh(token);

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256(token) },
        include: { user: true, customer: true },
      });
    });

    it('rejects an expired signature without touching the database', async () => {
      const token = await signRefreshToken('-1s');

      await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a revoked token and revokes every other session for that principal', async () => {
      const token = await signRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...liveStaffRow(),
        revokedAt: new Date(),
      });

      await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('rejects a token that is not in the database at all', async () => {
      const token = await signRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token signed with the access secret', async () => {
      const token = await jwt.signAsync({ sub: 'user-1' }, { secret: ACCESS_SECRET });

      await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented token by digest', async () => {
      const token = await jwt.signAsync(
        { sub: 'user-1', jti: 'jti-1', userType: 'staff' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      await expect(service.logout(token)).resolves.toEqual({ success: true });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('is idempotent for an unknown token so a client can always clear its session', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.logout('not-a-real-token')).resolves.toEqual({ success: true });
    });
  });
});
