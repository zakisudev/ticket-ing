import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Suites share one real test database, so files run sequentially.
    // (Concurrency correctness is tested *within* suites via Promise.all.)
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'mysql://zakisu_app:zakisu_dev_pw@127.0.0.1:3308/zakisu_tickets_test',
      APP_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      // Individual suites create many isolated users from the same loopback IP.
      // The dedicated auth test lowers this value to exercise the production limiter.
      REGISTRATION_RATE_MAX: '1000',
    },
    include: ['src/tests/**/*.test.ts'],
  },
});
