import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleCalendars, googleCalendarTokens } from "@agendario/db";
import { getDb } from "@/lib/db";
import { GCAL_SCOPES, getOAuth2Client, google } from "@/lib/google/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function back(req: NextRequest, query: Record<string, string>) {
  const url = new URL("/conectar-google", req.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const errParam = req.nextUrl.searchParams.get("error");

  if (errParam) return back(req, { error: errParam });
  if (!code) return back(req, { error: "missing_code" });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const oauth = getOAuth2Client();
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);

    const userInfo = await google
      .oauth2({ version: "v2", auth: oauth })
      .userinfo.get();
    const googleEmail = userInfo.data.email;

    if (!tokens.access_token) return back(req, { error: "no_access_token" });
    if (!tokens.refresh_token) {
      // Sem refresh token — Google só envia uma vez. Se está faltando, o user
      // já autorizou antes. Solução: revogar via myaccount.google.com e
      // refazer (startOAuth já usa prompt=consent pra forçar).
      return back(req, { error: "no_refresh_token" });
    }
    if (!googleEmail) return back(req, { error: "no_email" });

    const db = getDb();

    // 1. Soft-delete tokens antigos do mesmo (user, email)
    await db
      .update(googleCalendarTokens)
      .set({ is_active: false })
      .where(
        and(
          eq(googleCalendarTokens.user_id, user.id),
          eq(googleCalendarTokens.google_email, googleEmail)
        )
      );

    // 2. Insere o novo token
    await db.insert(googleCalendarTokens).values({
      user_id: user.id,
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000),
      scope: tokens.scope ?? GCAL_SCOPES.join(" "),
      is_active: true,
    });

    // 3. Lista calendários e popula cache (upsert manual — sem unique constraint)
    const list = await google
      .calendar({ version: "v3", auth: oauth })
      .calendarList.list({ maxResults: 50 });

    const items = list.data.items ?? [];
    for (const cal of items) {
      if (!cal.id || !cal.summary) continue;
      const isPrimary = cal.primary === true;

      const [existing] = await db
        .select({ id: googleCalendars.id })
        .from(googleCalendars)
        .where(
          and(
            eq(googleCalendars.user_id, user.id),
            eq(googleCalendars.calendar_id, cal.id)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(googleCalendars)
          .set({
            summary: cal.summary,
            timezone: cal.timeZone ?? null,
            color: cal.backgroundColor ?? null,
            primary: isPrimary,
            google_email: googleEmail,
          })
          .where(eq(googleCalendars.id, existing.id));
      } else {
        await db.insert(googleCalendars).values({
          user_id: user.id,
          google_email: googleEmail,
          calendar_id: cal.id,
          summary: cal.summary,
          timezone: cal.timeZone ?? null,
          color: cal.backgroundColor ?? null,
          primary: isPrimary,
          // Por padrão, habilita sync apenas no primary.
          sync_enabled: isPrimary,
          sync_direction: "push",
        });
      }
    }
  } catch (err) {
    return back(req, {
      error: "exchange_failed",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }

  return back(req, { connected: "1" });
}
