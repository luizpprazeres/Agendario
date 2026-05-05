import { and, eq } from "drizzle-orm";
import { googleCalendarTokens } from "@agendario/db";
import { getDb } from "@/lib/db";
import { getOAuth2Client } from "./client";

/**
 * Carrega o cliente OAuth com tokens persistidos. Refresh é automático
 * via o event listener "tokens" — quando o googleapis renova o access_token
 * (porque expirou), o novo valor é salvo no banco.
 *
 * Retorna null se o user não tem integração ativa.
 */
export async function getAuthorizedClient(userId: string) {
  const db = getDb();
  const [token] = await db
    .select()
    .from(googleCalendarTokens)
    .where(
      and(
        eq(googleCalendarTokens.user_id, userId),
        eq(googleCalendarTokens.is_active, true)
      )
    )
    .limit(1);

  if (!token) return null;

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expires_at.getTime(),
    scope: token.scope,
    token_type: "Bearer",
  });

  client.on("tokens", (tokens) => {
    void persistRefresh(token.id, tokens).catch(() => undefined);
  });

  return { client, token };
}

async function persistRefresh(
  tokenRowId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
  }
) {
  const db = getDb();
  const updates: Partial<typeof googleCalendarTokens.$inferInsert> = {};
  if (tokens.access_token) updates.access_token = tokens.access_token;
  if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;
  if (tokens.expiry_date) updates.expires_at = new Date(tokens.expiry_date);
  if (tokens.scope) updates.scope = tokens.scope;
  if (Object.keys(updates).length === 0) return;
  await db
    .update(googleCalendarTokens)
    .set(updates)
    .where(eq(googleCalendarTokens.id, tokenRowId));
}
