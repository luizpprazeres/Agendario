import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth callback Google Calendar — STUB.
 * Implementação real virá na Fase 2 (sync GCal).
 *
 * Fluxo planejado:
 *   1. Receber `code` query param
 *   2. Trocar por access_token + refresh_token
 *   3. Persistir em google_calendar_tokens (criptografado)
 *   4. Listar calendars (events.list) e popular google_calendars
 *   5. Registrar watch channel
 */
export function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { ok: false, error, stage: "oauth_consent" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    stage: "stub",
    code_received: Boolean(code),
    note: "Implementação completa na Fase 2 (sync Google Calendar).",
  });
}
