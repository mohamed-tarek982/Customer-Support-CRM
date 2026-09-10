import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALLOWED_LOCALES,
  SETTINGS_SCHEMA,
  SETTING_CATEGORIES,
  type SettingType,
} from './settings.constants';

/**
 * Reads and writes the org-wide settings, with an in-process cache so a change
 * takes effect immediately — same process, refreshed cache, no restart and no
 * redeploy. That is what the "changes apply without downtime" acceptance
 * criterion resolves to in Phase 1.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /**
   * TODO(scale): this cache is per-process. Phase 1 runs a single Nest container
   * (see docker-compose.yml), so a write is immediately visible to every reader.
   * If Phase 2 scales horizontally, replicas that did not serve the write will
   * keep serving stale values until they restart — that needs a shared cache or
   * a pub/sub invalidation channel, not a bigger map.
   */
  private cache: Map<string, unknown> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** All settings as a flat `{ 'org.name': 'CRM' }` object. Empty on an unseeded DB. */
  async getAll(): Promise<Record<string, unknown>> {
    const cache = await this.load();
    return Object.fromEntries(cache);
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const cache = await this.load();
    return cache.get(key) as T | undefined;
  }

  /**
   * Applies a partial patch. Keys absent from `patch` are left untouched.
   *
   * The upserts run in a single transaction so two admins saving at once cannot
   * interleave; the cache is then rebuilt from the committed rows and swapped in
   * one assignment, so a concurrent reader never observes a half-applied state.
   */
  async update(
    patch: Record<string, unknown>,
    actorUserId: string | null,
  ): Promise<Record<string, unknown>> {
    this.validate(patch);

    const entries = Object.entries(patch);

    // An empty patch is a no-op rather than an error: the form submits whatever
    // the admin changed, and changing nothing is not a failure.
    if (entries.length === 0) {
      return this.getAll();
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue, updatedBy: actorUserId },
          create: {
            key,
            value: value as Prisma.InputJsonValue,
            category: SETTING_CATEGORIES[key] ?? null,
            updatedBy: actorUserId,
          },
        }),
      ),
    );

    this.cache = await this.readFromDb();
    this.logger.log(
      `Settings updated by ${actorUserId ?? 'unknown'}: ${entries.map(([k]) => k).join(', ')}`,
    );

    return Object.fromEntries(this.cache);
  }

  /** Drops the cache so the next read reloads. Used by tests and by the seed path. */
  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<Map<string, unknown>> {
    if (!this.cache) {
      this.cache = await this.readFromDb();
    }
    return this.cache;
  }

  private async readFromDb(): Promise<Map<string, unknown>> {
    const rows = await this.prisma.systemSetting.findMany({ select: { key: true, value: true } });
    return new Map(rows.map((row) => [row.key, row.value as unknown]));
  }

  private validate(patch: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(patch)) {
      const expected: SettingType | undefined = SETTINGS_SCHEMA[key];

      if (!expected) {
        throw new BadRequestException(`Unknown setting: ${key}`);
      }

      if (typeof value !== expected) {
        throw new BadRequestException(
          `Setting "${key}" must be a ${expected}, received ${typeof value}`,
        );
      }

      if (expected === 'string' && (value as string).trim() === '') {
        throw new BadRequestException(`Setting "${key}" must not be empty`);
      }

      if (key === 'org.defaultLocale' && !ALLOWED_LOCALES.includes(value as 'en' | 'ar')) {
        throw new BadRequestException(
          `Setting "org.defaultLocale" must be one of: ${ALLOWED_LOCALES.join(', ')}`,
        );
      }
    }
  }
}
