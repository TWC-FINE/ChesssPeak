import path from 'node:path';
import { defineConfig } from 'prisma/config';

// The connection string comes from the .env at the repo root (git-ignored); in CI or production it comes from the environment.
try {
  process.loadEnvFile(path.join(process.cwd(), '..', '.env'));
} catch {
  // no .env: only the environment is used
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` does not connect, so a missing URL only matters for migrate and the integration tests
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://unset:unset@127.0.0.1:5432/unset' },
});
