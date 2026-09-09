/**
 * Unit-test config. E2E specs live in test/ and use test/jest-e2e.js instead.
 *
 * Regexes below use [.] rather than an escaped dot purely to keep them readable.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*[.]spec[.]ts$',
  transform: {
    '^.+[.](t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
  },
};
