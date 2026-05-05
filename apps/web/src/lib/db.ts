import { createDb, type Database } from "@agendario/db";
import { serverEnv } from "@/env";

let _db: Database | null = null;

/**
 * Singleton do client Drizzle (server-side apenas).
 * Lança se DATABASE_URL não estiver definida.
 */
export function getDb(): Database {
  if (_db) return _db;
  if (!serverEnv.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não definida. Rode `supabase start` e copie a DB URL para .env.local."
    );
  }
  _db = createDb(serverEnv.DATABASE_URL);
  return _db;
}
