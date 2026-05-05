import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Cria um client Drizzle a partir de uma DATABASE_URL.
 * Use o singleton em apps web; conexão fresca em scripts/jobs.
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
export { schema };
