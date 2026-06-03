import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(databaseUrl: string) {
  const queryClient = postgres(databaseUrl, { max: 10 });
  const db = drizzle(queryClient, { schema });
  return { db, queryClient };
}

export type Db = ReturnType<typeof createDb>['db'];
