import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
let pool = null;
export function getPool(databaseUrl) {
    if (pool)
        return pool;
    const url = databaseUrl ?? process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not configured');
    pool = mysql.createPool({
        uri: url,
        connectionLimit: 10,
        enableKeepAlive: true,
        multipleStatements: false,
        decimalNumbers: true,
    });
    return pool;
}
export function getDb(databaseUrl) {
    return drizzle(getPool(databaseUrl), { schema, mode: 'default' });
}
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
//# sourceMappingURL=client.js.map