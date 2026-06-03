import path from 'node:path';
import { defineConfig } from 'vitest/config';

const drizzleOrmRoot = path.resolve(__dirname, '../../packages/db/node_modules/drizzle-orm');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@washington/db',
        replacement: path.resolve(__dirname, '../../packages/db/src/index.ts'),
      },
      {
        find: '@washington/shared',
        replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
      {
        find: '@washington/business',
        replacement: path.resolve(__dirname, '../../packages/business/src/index.ts'),
      },
      {
        find: 'fastify-plugin',
        replacement: path.resolve(
          __dirname,
          '../../node_modules/.pnpm/fastify-plugin@5.1.0/node_modules/fastify-plugin/plugin.js',
        ),
      },
      {
        find: /^drizzle-orm(\/.*)?$/,
        replacement: `${drizzleOrmRoot}$1/index.js`,
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        external: [/node_modules/],
        interopDefault: true,
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/service.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
