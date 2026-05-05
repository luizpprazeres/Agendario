import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv } from "@/env";

/**
 * Client Supabase para Server Components / Route Handlers.
 * Lê cookies da request — auth.uid() funcionará em RLS.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  if (!clientEnv.NEXT_PUBLIC_SUPABASE_URL || !clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars not configured. Run `supabase start` first.");
  }
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components não podem setar cookies — ignorar.
          }
        },
      },
    }
  );
}
