import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { PrismaService } from '../../prisma/prisma.service';

type Row = { key: string; value: unknown };

/**
 * Prisma is mocked rather than hit: these tests are about the cache and the
 * allow-list, both of which are pure logic sitting in front of the database.
 * The `findMany` call count is asserted directly, because "a second read must
 * not hit the database" is the behaviour the story is buying.
 */
describe('SettingsService', () => {
  const SEEDED: Row[] = [
    { key: 'org.name', value: 'CRM' },
    { key: 'org.timezone', value: 'UTC' },
    { key: 'org.defaultLocale', value: 'en' },
    { key: 'org.dateFormat', value: 'yyyy-MM-dd' },
    { key: 'features.customerPortal', value: true },
  ];

  let rows: Row[];
  let findMany: jest.Mock;
  let upsert: jest.Mock;
  let prisma: PrismaService;
  let service: SettingsService;

  beforeEach(() => {
    rows = SEEDED.map((row) => ({ ...row }));

    findMany = jest.fn().mockImplementation(() => Promise.resolve(rows.map((row) => ({ ...row }))));

    // The mock stands in for the real upsert's effect on the table, so the
    // post-write cache reload observes the value that was just written.
    upsert = jest
      .fn()
      .mockImplementation((args: { where: { key: string }; update: { value: unknown } }) => {
        const existing = rows.find((row) => row.key === args.where.key);
        if (existing) existing.value = args.update.value;
        else rows.push({ key: args.where.key, value: args.update.value });
        return Promise.resolve({ key: args.where.key, value: args.update.value });
      });

    prisma = {
      systemSetting: { findMany, upsert },
      $transaction: (promises: Promise<unknown>[]) => Promise.all(promises),
    } as unknown as PrismaService;

    service = new SettingsService(prisma);
  });

  describe('getAll', () => {
    it('returns every seeded key', async () => {
      await expect(service.getAll()).resolves.toEqual({
        'org.name': 'CRM',
        'org.timezone': 'UTC',
        'org.defaultLocale': 'en',
        'org.dateFormat': 'yyyy-MM-dd',
        'features.customerPortal': true,
      });
    });

    it('serves the second read from cache without touching the database', async () => {
      await service.getAll();
      await service.getAll();

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('returns an empty object on an unseeded database', async () => {
      rows = [];

      await expect(service.getAll()).resolves.toEqual({});
    });
  });

  describe('get', () => {
    it('reads a single key', async () => {
      await expect(service.get('org.timezone')).resolves.toBe('UTC');
    });

    it('returns undefined for a key that has no row', async () => {
      await expect(service.get('org.missing')).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    it('writes only the patched keys and leaves the rest untouched', async () => {
      const result = await service.update({ 'org.name': 'Acme Support' }, 'user-1');

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(result['org.name']).toBe('Acme Support');
      expect(result['org.timezone']).toBe('UTC');
    });

    it('records the acting admin on the row', async () => {
      await service.update({ 'org.name': 'Acme Support' }, 'user-1');

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'org.name' },
          update: { value: 'Acme Support', updatedBy: 'user-1' },
        }),
      );
    });

    it('makes the new value visible to a later read without a restart', async () => {
      await service.update({ 'org.name': 'Acme Support' }, 'user-1');
      const after = await service.getAll();

      expect(after['org.name']).toBe('Acme Support');
    });

    it('rejects an unknown key without writing anything', async () => {
      await expect(service.update({ 'org.nope': 'x' }, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a value of the wrong type', async () => {
      await expect(
        service.update({ 'features.customerPortal': 'yes' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a default locale that is not a registered locale', async () => {
      await expect(service.update({ 'org.defaultLocale': 'fr' }, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts a registered locale', async () => {
      const result = await service.update({ 'org.defaultLocale': 'ar' }, 'user-1');

      expect(result['org.defaultLocale']).toBe('ar');
    });

    it('rejects a blank string rather than storing it', async () => {
      await expect(service.update({ 'org.name': '   ' }, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('treats an empty patch as a no-op that still returns the current values', async () => {
      const result = await service.update({}, 'user-1');

      expect(upsert).not.toHaveBeenCalled();
      expect(result['org.name']).toBe('CRM');
    });

    it('accepts a null actor, which is what an unattributed write looks like', async () => {
      await service.update({ 'org.name': 'Acme' }, null);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { value: 'Acme', updatedBy: null } }),
      );
    });
  });
});
