import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import type { EnvService } from '../../config/env';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

type PrismaMock = {
  user: { findUnique: jest.Mock; update: jest.Mock };
  customer: { findUnique: jest.Mock; update: jest.Mock };
  passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  refreshToken: { updateMany: jest.Mock };
};

describe('AuthService — password reset', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let mail: { sendPasswordReset: jest.Mock };

  const staff = { id: 'user-1', email: 'admin@example.com', isActive: true };
  const customer = { id: 'cust-1', email: 'customer@example.com', isActive: true };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      customer: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

    const env = { passwordResetTtl: '1h' } as unknown as EnvService;
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      env,
      mail as unknown as MailService,
    );
  });

  describe('forgotPassword', () => {
    it('is a no-op for an unknown email: no token row, no mail, no throw', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('creates a staff reset token and sends one mail', async () => {
      prisma.user.findUnique.mockResolvedValue(staff);

      await service.forgotPassword('admin@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const data = prisma.passwordResetToken.create.mock.calls[0]?.[0].data as {
        userType: string;
        userId: string | null;
        customerId: string | null;
      };
      expect(data.userType).toBe('staff');
      expect(data.userId).toBe('user-1');
      expect(data.customerId).toBeNull();
      expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    });

    it('creates a customer reset token when the email is only in customers', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(customer);

      await service.forgotPassword('customer@example.com');

      const data = prisma.passwordResetToken.create.mock.calls[0]?.[0].data as {
        userType: string;
        customerId: string | null;
      };
      expect(data.userType).toBe('customer');
      expect(data.customerId).toBe('cust-1');
    });
  });

  describe('resetPassword', () => {
    function validRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'prt-1',
        userType: 'staff',
        userId: 'user-1',
        customerId: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      };
    }

    it('updates the password, burns the token and revokes sessions — in that order', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRow());
      const order: string[] = [];
      prisma.user.update.mockImplementation(() => {
        order.push('password');
        return Promise.resolve({});
      });
      prisma.passwordResetToken.update.mockImplementation(() => {
        order.push('used');
        return Promise.resolve({});
      });
      prisma.refreshToken.updateMany.mockImplementation(() => {
        order.push('revoke');
        return Promise.resolve({ count: 1 });
      });

      await service.resetPassword('raw-token', 'a-brand-new-password');

      expect(order).toEqual(['password', 'used', 'revoke']);

      const updateArgs = prisma.user.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { passwordHash: string };
      };
      expect(updateArgs.where.id).toBe('user-1');
      await expect(
        bcrypt.compare('a-brand-new-password', updateArgs.data.passwordHash),
      ).resolves.toBe(true);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('resets a customer password against the customers table', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        validRow({ userType: 'customer', userId: null, customerId: 'cust-1' }),
      );

      await service.resetPassword('raw-token', 'a-brand-new-password');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { passwordHash: expect.any(String) as string },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'cust-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('looks the token up by digest', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRow());

      await service.resetPassword('raw-token', 'a-brand-new-password');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('raw-token') },
      });
    });

    it.each([
      ['unknown', null],
      ['already used', { usedAt: new Date() }],
      ['expired', { expiresAt: new Date(Date.now() - 1000) }],
    ])('throws the identical error for a %s token', async (_label, overrides) => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        overrides === null ? null : validRow(overrides),
      );

      await expect(service.resetPassword('raw-token', 'a-brand-new-password')).rejects.toThrow(
        new BadRequestException('Invalid or expired reset token'),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
