import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  categories,
  financialAccounts,
  inboxBatchItems,
  inboxBatches,
} from "@agendario/db";
import { getDb } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BatchReview } from "../batch-review";

export const dynamic = "force-dynamic";

const dateLong = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function BatchPage({
  params,
}: {
  params: Promise<{ batch_id: string }>;
}) {
  const { batch_id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [batch] = await db
    .select()
    .from(inboxBatches)
    .where(
      and(eq(inboxBatches.id, batch_id), eq(inboxBatches.user_id, user.id))
    )
    .limit(1);
  if (!batch) redirect("/importar");

  const items = await db
    .select()
    .from(inboxBatchItems)
    .where(
      and(
        eq(inboxBatchItems.batch_id, batch.id),
        eq(inboxBatchItems.user_id, user.id)
      )
    )
    .orderBy(asc(inboxBatchItems.position));

  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      icon: categories.icon,
      color: categories.color,
    })
    .from(categories)
    .where(eq(categories.user_id, user.id))
    .orderBy(asc(categories.name));

  const userAccounts = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      type: financialAccounts.type,
      institution: financialAccounts.institution,
      is_archived: financialAccounts.is_archived,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.user_id, user.id))
    .orderBy(asc(financialAccounts.name));

  // Estado parsing — mostra placeholder polling-friendly
  if (batch.status === "parsing") {
    return (
      <ParsingState
        batchId={batch.id}
        createdAt={batch.created_at}
      />
    );
  }

  if (batch.status === "failed") {
    return (
      <FailedState
        batchId={batch.id}
        errorMessage={batch.error_message}
      />
    );
  }

  const detectedLabel =
    batch.detected_origin && batch.detected_origin !== "unknown"
      ? batch.detected_origin
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Importação";

  const periodLabel = (() => {
    const s = batch.statement_period_start;
    const e = batch.statement_period_end;
    if (!s && !e) return null;
    if (s && e) {
      return `${dateLong.format(new Date(`${s}T00:00:00Z`))} → ${dateLong.format(new Date(`${e}T00:00:00Z`))}`;
    }
    return dateLong.format(new Date(`${(s ?? e)!}T00:00:00Z`));
  })();

  return (
    <BatchReview
      batch={{
        id: batch.id,
        status: batch.status,
        detected_origin_label: detectedLabel,
        period_label: periodLabel,
        target_account_id: batch.target_account_id,
        notes: batch.notes,
      }}
      items={items.map((it) => ({
        id: it.id,
        position: it.position,
        raw_description: it.raw_description,
        description: it.description,
        amount_cents: Number(it.amount_cents),
        type: it.type,
        occurred_on: it.occurred_on,
        suggested_category_id: it.suggested_category_id,
        is_duplicate: it.is_duplicate,
        installment_current: it.installment_current,
        installment_total: it.installment_total,
        status: it.status,
      }))}
      categories={userCategories.filter((c) =>
        c.type === "income" || c.type === "expense"
      )}
      accounts={userAccounts.filter((a) => !a.is_archived)}
    />
  );
}

function ParsingState({
  batchId,
  createdAt,
}: {
  batchId: string;
  createdAt: Date;
}) {
  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl pb-24 sm:pb-10"
      style={{ background: "oklch(0.17 0.006 30)" }}
    >
      <header className="px-4 pt-5 pb-3 sm:px-6 sm:pt-8">
        <Link
          href="/importar"
          className="text-xs"
          style={{ color: "oklch(0.55 0.006 30)" }}
        >
          ← importações
        </Link>
        <h1
          className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ fontStretch: "92%" }}
        >
          Lendo a fatura…
        </h1>
      </header>
      <div className="px-4 sm:px-6">
        <section
          className="rounded-3xl border p-6 text-center sm:p-8"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.245 0.008 30)",
          }}
        >
          <div className="mx-auto h-1 w-32 overflow-hidden rounded-full" style={{ background: "oklch(0.27 0.008 30)" }}>
            <div
              className="h-full animate-pulse rounded-full"
              style={{ width: "60%", background: "oklch(0.78 0.14 80)" }}
            />
          </div>
          <p className="mt-5 text-sm" style={{ color: "oklch(0.7 0.006 30)" }}>
            Geralmente leva entre 10 e 30 segundos. Recarregue a página em alguns instantes.
          </p>
          <p className="mt-2 text-[11px]" style={{ color: "oklch(0.55 0.006 30)" }}>
            Iniciado em {dateLong.format(new Date(createdAt))} · ID {batchId.slice(0, 8)}
          </p>
          <form action={refreshAction.bind(null, batchId)}>
            <button
              type="submit"
              className="mt-5 grid h-10 w-full place-items-center rounded-2xl border text-sm font-medium"
              style={{
                background: "oklch(0.245 0.008 30)",
                borderColor: "oklch(0.28 0.008 30)",
                color: "oklch(0.92 0.006 30)",
              }}
            >
              Recarregar
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function FailedState({
  batchId,
  errorMessage,
}: {
  batchId: string;
  errorMessage: string | null;
}) {
  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl pb-24 sm:pb-10"
      style={{ background: "oklch(0.17 0.006 30)" }}
    >
      <header className="px-4 pt-5 pb-3 sm:px-6 sm:pt-8">
        <Link
          href="/importar"
          className="text-xs"
          style={{ color: "oklch(0.55 0.006 30)" }}
        >
          ← importações
        </Link>
        <h1
          className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ fontStretch: "92%" }}
        >
          Falhou ao ler.
        </h1>
      </header>
      <div className="px-4 sm:px-6">
        <section
          className="rounded-3xl border p-6 sm:p-8"
          style={{
            background: "oklch(0.27 0.06 25 / 0.2)",
            borderColor: "oklch(0.4 0.08 25 / 0.4)",
          }}
        >
          <p className="text-sm" style={{ color: "oklch(0.85 0.12 25)" }}>
            Não consegui extrair a fatura.
          </p>
          {errorMessage ? (
            <p
              className="mt-2 break-words font-mono text-[11px]"
              style={{ color: "oklch(0.7 0.06 25)" }}
            >
              {errorMessage}
            </p>
          ) : null}
          <p className="mt-3 text-[11px]" style={{ color: "oklch(0.55 0.006 30)" }}>
            Tente subir uma imagem mais nítida ou um PDF de texto. ID {batchId.slice(0, 8)}.
          </p>
        </section>
      </div>
    </main>
  );
}

async function refreshAction(_batchId: string) {
  "use server";
  // Server action sem-op — força re-render (Next revalida a route automaticamente)
}
