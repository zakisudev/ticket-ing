import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';

export type Db = MySql2Database<typeof schema>;

let pool: mysql.Pool | null = null;

export function getPool(databaseUrl?: string): mysql.Pool {
  if (pool) return pool;
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    enableKeepAlive: true,
    multipleStatements: false,
    decimalNumbers: true,
  });
  return pool;
}

export function getDb(databaseUrl?: string): Db {
  return drizzle(getPool(databaseUrl), { schema, mode: 'default' });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
