import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { inboxBatches } from "@agendario/db";
import { getDb } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UploadButton } from "./upload-modal";

export const dynamic = "force-dynamic";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateLong = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  parsing: { text: "Processando", color: "oklch(0.78 0.14 80)" },
  review: { text: "Revisar", color: "oklch(0.74 0.14 235)" },
  confirmed: { text: "Confirmado", color: "oklch(0.85 0.16 155)" },
  discarded: { text: "Descartado", color: "oklch(0.55 0.006 30)" },
  failed: { text: "Falhou", color: "oklch(0.74 0.16 25)" },
};

export default async function ImportarPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const batches = await db
    .select({
      id: inboxBatches.id,
      source: inboxBatches.source,
      detected_origin: inboxBatches.detected_origin,
      status: inboxBatches.status,
      total_count: inboxBatches.total_count,
      total_amount_cents: inboxBatches.total_amount_cents,
      created_at: inboxBatches.created_at,
      statement_period_start: inboxBatches.statement_period_start,
      statement_period_end: inboxBatches.statement_period_end,
    })
    .from(inboxBatches)
    .where(eq(inboxBatches.user_id, user.id))
    .orderBy(desc(inboxBatches.created_at))
    .limit(20);

  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl pb-24 sm:pb-10"
      style={{ background: "oklch(0.17 0.006 30)" }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-8">
        <div>
          <Link
            href="/dashboard"
            className="text-xs"
            style={{ color: "oklch(0.55 0.006 30)" }}
          >
            ← painel
          </Link>
          <h1
            className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontStretch: "92%" }}
          >
            Importar fatura.
          </h1>
        </div>
      </header>

      <div className="space-y-3 px-4 sm:space-y-4 sm:px-6">
        {/* Upload card */}
        <section
          className="rounded-3xl border p-5 sm:p-6"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.245 0.008 30)",
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "oklch(0.55 0.006 30)" }}
          >
            nova importação
          </p>
          <p className="mt-2 mb-4 text-sm" style={{ color: "oklch(0.7 0.006 30)" }}>
            Print de fatura do Nubank, PDF do Itaú, foto do extrato — extraio,
            categorizo e você revisa.
          </p>
          <UploadButton />
        </section>

        {/* Lista de batches */}
        <section
          className="rounded-3xl border p-5 sm:p-6"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.245 0.008 30)",
          }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              className="text-base font-medium"
              style={{ fontStretch: "94%" }}
            >
              Histórico
            </h2>
            <p className="text-xs" style={{ color: "oklch(0.55 0.006 30)" }}>
              {batches.length === 0 ? "—" : `${batches.length} última${batches.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {batches.length === 0 ? (
            <p
              className="rounded-2xl border px-4 py-6 text-center text-xs"
              style={{
                background: "oklch(0.245 0.008 30)",
                borderColor: "oklch(0.28 0.008 30)",
                color: "oklch(0.55 0.006 30)",
              }}
            >
              Nenhuma importação ainda. Suba uma fatura aí em cima.
            </p>
          ) : (
            <ul
              className="-mx-1 divide-y"
              style={{ borderColor: "oklch(0.245 0.008 30)" }}
            >
              {batches.map((b) => {
                const status = STATUS_LABEL[b.status] ?? {
                  text: b.status,
                  color: "oklch(0.55 0.006 30)",
                };
                const totalCents = Number(b.total_amount_cents);
                const subtitle =
                  b.detected_origin && b.detected_origin !== "unknown"
                    ? b.detected_origin
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())
                    : b.source.replace(/_/g, " ");
                const dateStr = b.created_at
                  ? dateLong.format(new Date(b.created_at))
                  : "";
                const href =
                  b.status === "review" || b.status === "confirmed"
                    ? `/importar/${b.id}`
                    : b.status === "parsing"
                      ? `/importar/${b.id}`
                      : null;

                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-sm">{subtitle}</p>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
                          style={{
                            background: `color-mix(in oklch, ${status.color} 18%, transparent)`,
                            color: status.color,
                          }}
                        >
                          {status.text}
                        </span>
                      </div>
                      <p
                        className="truncate text-[11px]"
                        style={{ color: "oklch(0.55 0.006 30)" }}
                      >
                        {dateStr}
                        {b.total_count > 0
                          ? ` · ${b.total_count} ite${b.total_count === 1 ? "m" : "ns"}`
                          : ""}
                      </p>
                    </div>
                    {totalCents > 0 ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {BRL.format(totalCents / 100)}
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <li
                    key={b.id}
                    className="px-1 py-2.5"
                    style={{ borderColor: "oklch(0.245 0.008 30)" }}
                  >
                    {href ? (
                      <Link
                        href={href}
                        className="flex items-center gap-3 transition hover:opacity-90"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 opacity-70">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
