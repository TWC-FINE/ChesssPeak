/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '.*\.spec\.ts$',
  // integration tests need the local databases: they run with pnpm test:integration, not with pnpm test
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
};
