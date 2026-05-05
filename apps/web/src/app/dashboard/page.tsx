import { and, desc, eq, gte, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  categories,
  financialAccounts,
  shifts,
  transactions,
  workplaces,
} from "@agendario/db";
import { getDb } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Recife",
});

const timeOnly = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Recife",
});

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// TODO: queries usam Drizzle direct (postgres role) — bypassa RLS.
// Filtro manual por user_id é a única defesa. Migrar para client Supabase
// REST ou getRlsDb(userId) quando shape de queries estabilizar.
async function loadDashboard(userId: string) {
  const db = getDb();

  const recentTx = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount_cents: transactions.amount_cents,
      description: transactions.description,
      occurred_on: transactions.occurred_on,
      category_name: categories.name,
      category_icon: categories.icon,
      account_name: financialAccounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.category_id))
    .leftJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.account_id)
    )
    .where(eq(transactions.user_id, userId))
    .orderBy(desc(transactions.occurred_on), desc(transactions.created_at))
    .limit(20);

  const upcoming = await db
    .select({
      id: shifts.id,
      title: shifts.title,
      starts_at: shifts.starts_at,
      ends_at: shifts.ends_at,
      pay_cents: shifts.pay_cents,
      status: shifts.status,
      workplace_name: workplaces.name,
      workplace_short: workplaces.short_name,
    })
    .from(shifts)
    .leftJoin(workplaces, eq(workplaces.id, shifts.workplace_id))
    .where(and(eq(shifts.user_id, userId), gte(shifts.starts_at, new Date())))
    .orderBy(asc(shifts.starts_at))
    .limit(10);

  return { recentTx, upcoming };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { recentTx, upcoming } = await loadDashboard(user.id);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agendario</h1>
          <p className="text-xs text-zinc-500">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            Sair
          </button>
        </form>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300">
          Transações recentes
        </h2>
        {recentTx.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-xs text-zinc-500">
            Nenhuma transação ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentTx.map((tx) => {
              const cents = Number(tx.amount_cents);
              const isIncome = tx.type === "income" || cents > 0;
              const value = BRL.format(Math.abs(cents) / 100);
              return (
                <li
                  key={tx.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm text-zinc-100">
                      {tx.description}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {dateLong.format(new Date(tx.occurred_on))}
                      {tx.category_name ? (
                        <>
                          {" · "}
                          {tx.category_icon ? `${tx.category_icon} ` : ""}
                          {tx.category_name}
                        </>
                      ) : (
                        " · sem categoria"
                      )}
                      {tx.account_name ? ` · ${tx.account_name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      isIncome ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isIncome ? "+" : "−"}
                    {value}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300">Plantões próximos</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-xs text-zinc-500">
            Nenhum plantão agendado.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((sh) => {
              const start = new Date(sh.starts_at);
              const end = new Date(sh.ends_at);
              const pay = sh.pay_cents
                ? BRL.format(Number(sh.pay_cents) / 100)
                : null;
              const place =
                sh.workplace_short ?? sh.workplace_name ?? "Local desconhecido";
              return (
                <li
                  key={sh.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm text-zinc-100">
                      {sh.title ?? place}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {dateTime.format(start)} → {timeOnly.format(end)}
                      {sh.title && sh.workplace_name
                        ? ` · ${sh.workplace_name}`
                        : ""}
                    </p>
                  </div>
                  {pay ? (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-300">
                      {pay}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
