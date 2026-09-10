import { IsObject } from 'class-validator';

/**
 * Only the outer shape is validated here. Per-key validation happens in
 * `SettingsService.update` against `SETTINGS_SCHEMA`, because the allow-list is
 * data rather than a fixed set of class properties.
 */
export class UpdateSettingsDto {
  @IsObject()
  patch!: Record<string, unknown>;
}
