/**
 * End-to-end config. Boots the real Nest application against a real PostgreSQL
 * database, so `docker compose up -d` and a migrated database are prerequisites.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: '[.]e2e-spec[.]ts$',
  transform: {
    '^.+[.](t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  setupFiles: ['reflect-metadata', '<rootDir>/test/setup-e2e.js'],
  testTimeout: 30000,
};
