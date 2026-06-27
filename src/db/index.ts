import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let dbInstance: NodePgDatabase<typeof schema> | null = null;

function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/house_of_edtech';

    if (process.env.NODE_ENV === 'production' && (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost'))) {
      console.error('CRITICAL WARNING: DATABASE_URL environment variable is not configured or points to localhost!');
    }

    const pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });

    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

// Export db as a proxy to lazily delegate queries to the runtime-initialized client with full type safety
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(target, prop) {
    return (getDb() as any)[prop];
  }
});
