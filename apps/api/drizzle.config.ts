import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ?? 'mysql://zakisu_app:zakisu_dev_pw@127.0.0.1:3308/zakisu_tickets';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
