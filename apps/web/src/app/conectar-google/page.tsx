import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { googleCalendars, googleCalendarTokens } from "@agendario/db";
import { getDb } from "@/lib/db";
import { GCAL_SCOPES, getOAuth2Client } from "@/lib/google/client";
import { getAuthorizedClient } from "@/lib/google/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ERROR_LABELS: Record<string, string> = {
  missing_code: "Autorização cancelada antes da conclusão.",
  no_access_token: "Não recebemos o access_token do Google.",
  no_refresh_token:
    "Sem refresh_token. Vá em myaccount.google.com → Segurança → Apps com acesso, remova 'Agendario', e tente novamente.",
  no_email: "Não conseguimos ler o email da sua conta Google.",
  exchange_failed: "Falha ao trocar código por tokens.",
  access_denied: "Você cancelou a autorização.",
};

async function startOAuth() {
  "use server";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const oauth = getOAuth2Client();
  const url = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GCAL_SCOPES,
    include_granted_scopes: true,
  });
  redirect(url);
}

async function disconnect() {
  "use server";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const auth = await getAuthorizedClient(user.id);
  if (auth?.token.access_token) {
    try {
      await auth.client.revokeToken(auth.token.access_token);
    } catch {
      // Ignora — pode falhar se já revogado externamente.
    }
  }

  const db = getDb();
  await db
    .update(googleCalendarTokens)
    .set({ is_active: false })
    .where(eq(googleCalendarTokens.user_id, user.id));

  revalidatePath("/conectar-google");
}

async function toggleCalendar(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const calendarId = String(formData.get("calendar_id") ?? "");
  const enable = formData.get("enable") === "1";
  if (!calendarId) return;

  const db = getDb();
  await db
    .update(googleCalendars)
    .set({ sync_enabled: enable })
    .where(
      and(
        eq(googleCalendars.user_id, user.id),
        eq(googleCalendars.calendar_id, calendarId)
      )
    );

  revalidatePath("/conectar-google");
}

export default async function ConnectGooglePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; connected?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error, detail, connected } = await searchParams;

  const db = getDb();
  const [token] = await db
    .select({
      id: googleCalendarTokens.id,
      google_email: googleCalendarTokens.google_email,
      created_at: googleCalendarTokens.created_at,
    })
    .from(googleCalendarTokens)
    .where(
      and(
        eq(googleCalendarTokens.user_id, user.id),
        eq(googleCalendarTokens.is_active, true)
      )
    )
    .limit(1);

  const calendars = token
    ? await db
        .select()
        .from(googleCalendars)
        .where(eq(googleCalendars.user_id, user.id))
        .orderBy(asc(googleCalendars.summary))
    : [];

  const errorMsg = error
    ? ERROR_LABELS[error] ?? `Erro: ${error}${detail ? ` (${detail})` : ""}`
    : null;

  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl px-4 py-6 sm:px-6 sm:py-10"
      style={{ background: "oklch(0.17 0.006 30)" }}
    >
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <p
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "oklch(0.55 0.006 30)" }}
          >
            integrações
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontStretch: "92%" }}
          >
            Google Calendar
          </h1>
        </div>
        <a
          href="/dashboard"
          className="text-xs hover:text-zinc-100"
          style={{ color: "oklch(0.7 0.006 30)" }}
        >
          ← dashboard
        </a>
      </header>

      {connected === "1" ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{
            background: "oklch(0.27 0.04 155 / 0.4)",
            borderColor: "oklch(0.4 0.1 155 / 0.4)",
            color: "oklch(0.85 0.16 155)",
          }}
        >
          ✓ Conectado com sucesso. Plantões novos vão aparecer no calendário.
        </div>
      ) : null}

      {errorMsg ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{
            background: "oklch(0.27 0.06 25 / 0.3)",
            borderColor: "oklch(0.4 0.1 25 / 0.4)",
            color: "oklch(0.85 0.14 25)",
          }}
        >
          {errorMsg}
        </div>
      ) : null}

      {!token ? (
        <section
          className="rounded-3xl border p-6"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.28 0.008 30)",
          }}
        >
          <p className="text-sm" style={{ color: "oklch(0.7 0.006 30)" }}>
            Conecte sua conta do Google pra que cada plantão confirmado pelo bot
            apareça automaticamente no seu calendário, com hospital, horário e
            valor de pagamento.
          </p>
          <ul
            className="mt-4 space-y-2 text-xs"
            style={{ color: "oklch(0.55 0.006 30)" }}
          >
            <li>· Sync uma direção: Agendario → Google Calendar.</li>
            <li>· Você escolhe quais calendários receberão eventos.</li>
            <li>· Permissão mínima: criar/editar eventos próprios.</li>
            <li>· Pode desconectar a qualquer momento.</li>
          </ul>
          <form action={startOAuth} className="mt-6">
            <button
              type="submit"
              className="rounded-xl px-4 py-2 text-sm font-medium transition"
              style={{
                background: "oklch(0.85 0.16 155)",
                color: "oklch(0.2 0.04 155)",
              }}
            >
              Conectar Google Calendar
            </button>
          </form>
        </section>
      ) : (
        <>
          <section
            className="mb-4 rounded-3xl border p-5 sm:p-6"
            style={{
              background: "oklch(0.21 0.007 30)",
              borderColor: "oklch(0.28 0.008 30)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className="font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: "oklch(0.55 0.006 30)" }}
                >
                  conectado
                </p>
                <p className="mt-1 text-base font-medium">{token.google_email}</p>
              </div>
              <form action={disconnect}>
                <button
                  type="submit"
                  className="rounded-lg border px-3 py-1.5 text-xs transition"
                  style={{
                    borderColor: "oklch(0.28 0.008 30)",
                    color: "oklch(0.7 0.006 30)",
                  }}
                >
                  Desconectar
                </button>
              </form>
            </div>
          </section>

          <section
            className="rounded-3xl border p-5 sm:p-6"
            style={{
              background: "oklch(0.21 0.007 30)",
              borderColor: "oklch(0.28 0.008 30)",
            }}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                className="text-base font-medium"
                style={{ fontStretch: "94%" }}
              >
                Calendários
              </h2>
              <p className="text-xs" style={{ color: "oklch(0.55 0.006 30)" }}>
                escolha onde criar plantões
              </p>
            </div>
            {calendars.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: "oklch(0.55 0.006 30)" }}
              >
                Nenhum calendário encontrado.
              </p>
            ) : (
              <ul className="space-y-2">
                {calendars.map((cal) => (
                  <li
                    key={cal.id}
                    className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                    style={{
                      background: "oklch(0.245 0.008 30)",
                      borderColor: "oklch(0.28 0.008 30)",
                    }}
                  >
                    <span
                      className="size-3 shrink-0 rounded"
                      style={{
                        background: cal.color ?? "oklch(0.5 0.05 250)",
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {cal.summary}
                        {cal.primary ? (
                          <span
                            className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                            style={{
                              background: "oklch(0.85 0.16 155 / 0.18)",
                              color: "oklch(0.85 0.16 155)",
                            }}
                          >
                            primary
                          </span>
                        ) : null}
                      </p>
                      {cal.timezone ? (
                        <p
                          className="font-mono text-[10px]"
                          style={{ color: "oklch(0.55 0.006 30)" }}
                        >
                          {cal.timezone}
                        </p>
                      ) : null}
                    </div>
                    <form action={toggleCalendar}>
                      <input type="hidden" name="calendar_id" value={cal.calendar_id} />
                      <input
                        type="hidden"
                        name="enable"
                        value={cal.sync_enabled ? "0" : "1"}
                      />
                      <button
                        type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                        style={
                          cal.sync_enabled
                            ? {
                                background: "oklch(0.85 0.16 155)",
                                color: "oklch(0.2 0.04 155)",
                              }
                            : {
                                background: "oklch(0.245 0.008 30)",
                                color: "oklch(0.7 0.006 30)",
                                border: "1px solid oklch(0.28 0.008 30)",
                              }
                        }
                      >
                        {cal.sync_enabled ? "ativo" : "ativar"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <p
              className="mt-4 text-[11px]"
              style={{ color: "oklch(0.55 0.006 30)" }}
            >
              Plantões serão criados no primeiro calendário ativo. Eventos
              levam até 10 segundos pra aparecer após confirmar pelo bot.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
