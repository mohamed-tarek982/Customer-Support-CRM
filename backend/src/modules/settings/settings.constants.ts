/**
 * The complete set of settings an admin may edit (SCRUM-36).
 *
 * This allow-list is the validation contract for `PUT /settings`: a key that is
 * not here is rejected, and a value whose type does not match is rejected. Add a
 * key here and to `prisma/seed.ts` in the same change — a key that exists in one
 * and not the other renders as a blank field.
 */
export type SettingType = 'string' | 'boolean';

export const SETTINGS_SCHEMA: Record<string, SettingType> = {
  'org.name': 'string',
  'org.timezone': 'string',
  'org.defaultLocale': 'string',
  'org.dateFormat': 'string',
  'features.customerPortal': 'boolean',
};

/**
 * Mirrors `APP_LOCALES` in `frontend/i18n/locale-config.ts`. Deliberately
 * duplicated rather than imported: the backend does not depend on the frontend
 * build. Adding a locale means editing both.
 */
export const ALLOWED_LOCALES = ['en', 'ar'] as const;

/** UI grouping only; never affects validation. */
export const SETTING_CATEGORIES: Record<string, string> = {
  'org.name': 'general',
  'org.timezone': 'general',
  'org.defaultLocale': 'localisation',
  'org.dateFormat': 'localisation',
  'features.customerPortal': 'features',
};
