import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/env";
import { serverEnv } from "@/env";

/**
 * Service-role client — BYPASSA RLS.
 *
 * Use APENAS em background jobs (Inngest functions) ou rotinas de manutenção
 * que precisam acessar dados sem contexto de cookie. NUNCA expor a chave
 * em código client-side ou em route handlers que retornam dados ao usuário
 * sem filtrar por user_id manualmente.
 */
let _admin: SupabaseClient | null = null;

export function createSupabaseServiceClient(): SupabaseClient {
  if (_admin) return _admin;
  if (!clientEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada");
  }
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada (necessária pra Inngest)"
    );
  }
  _admin = createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _admin;
}
