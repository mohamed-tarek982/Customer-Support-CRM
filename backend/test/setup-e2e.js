/* eslint-disable */
// Loads backend/.env for e2e runs and forces NODE_ENV=test so AppModule skips
// registering the demo cron.
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

process.env.NODE_ENV = 'test';

const envPath = join(__dirname, '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
