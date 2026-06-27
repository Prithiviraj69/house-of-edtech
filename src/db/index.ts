import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/house_of_edtech';

if (process.env.NODE_ENV === 'production' && (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost'))) {
  console.error('CRITICAL WARNING: DATABASE_URL environment variable is not configured or points to localhost!');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

export const db = drizzle(pool, { schema });
