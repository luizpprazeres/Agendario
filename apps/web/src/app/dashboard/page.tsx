import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  categories,
  expenseTemplates,
  financialAccounts,
  shifts,
  subscriptions,
  transactions,
  workplaces,
} from "@agendario/db";
import { getDb } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InteractiveBackground } from "./_components/InteractiveBackground";

export const dynamic = "force-dynamic";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateLong = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const dayShort = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  timeZone: "America/Recife",
});

const dayNumber = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  timeZone: "America/Recife",
});

const timeShort = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Recife",
});

function monthRange(tz = "America/Recife") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${year}-${pad(month)}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endStr = `${nextYear}-${pad(nextMonth)}-01`;
  return { startStr, endStr, year, month };
}

function monthLabel(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const name = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayLabel() {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Recife",
  });
  return fmt.format(new Date());
}

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function applyTemplate(formData: FormData) {
  "use server";

  const templateId = String(formData.get("template_id") ?? "");
  if (!templateId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDb();

  const [tpl] = await db
    .select()
    .from(expenseTemplates)
    .where(
      and(
        eq(expenseTemplates.id, templateId),
        eq(expenseTemplates.user_id, user.id),
        eq(expenseTemplates.is_archived, false)
      )
    )
    .limit(1);

  if (!tpl) return;

  // Resolve account: usa default_account_id, senão primeira conta non-credit ativa.
  let accountId = tpl.default_account_id;
  if (!accountId) {
    const [acc] = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.user_id, user.id),
          eq(financialAccounts.is_archived, false)
        )
      )
      .orderBy(asc(financialAccounts.created_at))
      .limit(1);
    accountId = acc?.id ?? null;
  }
  if (!accountId) return;

  // Aplica sinal conforme type. amount_cents é STRING decimal.
  const baseAmount = Number(tpl.default_amount_cents);
  const signedAmount =
    tpl.type === "expense" ? -Math.abs(baseAmount) : Math.abs(baseAmount);

  // Hoje em America/Recife (YYYY-MM-DD).
  const occurredOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [created] = await db
    .insert(transactions)
    .values({
      user_id: user.id,
      account_id: accountId,
      category_id: tpl.default_category_id,
      workplace_id: tpl.default_workplace_id,
      type: tpl.type,
      amount_cents: signedAmount.toString(),
      description: tpl.description_template,
      occurred_on: occurredOn,
      source: "template",
      external_id: `tpl:${tpl.id}:${Date.now()}`,
      notes: tpl.notes,
    })
    .returning({ id: transactions.id });

  if (!created) return;

  // Bump usage stats.
  await db
    .update(expenseTemplates)
    .set({
      usage_count: sql`${expenseTemplates.usage_count} + 1`,
      last_used_at: new Date(),
    })
    .where(eq(expenseTemplates.id, tpl.id));

  // Categorize via LLM se template não tinha categoria pré-definida.
  if (!tpl.default_category_id) {
    await inngest.send({
      name: "transactions/categorize-requested",
      data: { transaction_id: created.id },
    });
  }

  revalidatePath("/dashboard");
}

// TODO: queries usam Drizzle direct (postgres role) — bypassa RLS.
// Filtro manual por user_id é a única defesa. Migrar para client Supabase
// REST ou getRlsDb(userId) quando shape de queries estabilizar.
async function loadDashboard(userId: string) {
  const db = getDb();
  const { startStr, endStr, year, month } = monthRange();

  const totalRow = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount_cents}), 0)` })
    .from(transactions)
    .where(eq(transactions.user_id, userId));

  const monthTotals = await db
    .select({
      type: transactions.type,
      total: sql<string>`SUM(${transactions.amount_cents})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.user_id, userId),
        gte(transactions.occurred_on, startStr),
        lt(transactions.occurred_on, endStr),
        inArray(transactions.type, ["income", "expense"])
      )
    )
    .groupBy(transactions.type);

  const topCategories = await db
    .select({
      category_id: transactions.category_id,
      category_name: categories.name,
      category_icon: categories.icon,
      category_color: categories.color,
      total: sql<string>`SUM(ABS(${transactions.amount_cents}))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.category_id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.type, "expense"),
        gte(transactions.occurred_on, startStr),
        lt(transactions.occurred_on, endStr)
      )
    )
    .groupBy(
      transactions.category_id,
      categories.name,
      categories.icon,
      categories.color
    )
    .orderBy(desc(sql`SUM(ABS(${transactions.amount_cents}))`))
    .limit(5);

  const recentTx = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount_cents: transactions.amount_cents,
      description: transactions.description,
      occurred_on: transactions.occurred_on,
      category_name: categories.name,
      category_icon: categories.icon,
      category_color: categories.color,
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
    .limit(8);

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
      workplace_color: workplaces.color,
    })
    .from(shifts)
    .leftJoin(workplaces, eq(workplaces.id, shifts.workplace_id))
    .where(and(eq(shifts.user_id, userId), gte(shifts.starts_at, new Date())))
    .orderBy(asc(shifts.starts_at))
    .limit(5);

  const activeSubscriptions = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      vendor: subscriptions.vendor,
      amount_cents: subscriptions.amount_cents,
      billing_cycle: subscriptions.billing_cycle,
      next_charge_on: subscriptions.next_charge_on,
      color: subscriptions.color,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.user_id, userId),
        eq(subscriptions.status, "active")
      )
    )
    .orderBy(asc(subscriptions.next_charge_on));

  const favoriteTemplates = await db
    .select({
      id: expenseTemplates.id,
      name: expenseTemplates.name,
      icon: expenseTemplates.icon,
      color: expenseTemplates.color,
      type: expenseTemplates.type,
      default_amount_cents: expenseTemplates.default_amount_cents,
    })
    .from(expenseTemplates)
    .where(
      and(
        eq(expenseTemplates.user_id, userId),
        eq(expenseTemplates.is_archived, false)
      )
    )
    .orderBy(
      desc(expenseTemplates.usage_count),
      asc(expenseTemplates.sort_order),
      asc(expenseTemplates.name)
    )
    .limit(6);

  const totalCents = Number(totalRow[0]?.total ?? 0);

  return {
    totalCents,
    recentTx,
    upcoming,
    activeSubscriptions,
    favoriteTemplates,
    monthSummary: {
      label: monthLabel(year, month),
      totals: monthTotals,
      topCategories,
    },
  };
}

function buildSparkPath(values: number[], width: number, height: number) {
  if (values.length === 0) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(points.at(-1)?.[0] ?? width).toFixed(1)},${height} L0,${height} Z`;
  return { line, area };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const firstName = (user.user_metadata?.full_name as string | undefined)
    ?.split(" ")[0]
    ?.trim();

  const {
    totalCents,
    recentTx,
    upcoming,
    activeSubscriptions,
    favoriteTemplates,
    monthSummary,
  } = await loadDashboard(user.id);

  const subsMonthlyCents = activeSubscriptions.reduce((sum, sub) => {
    const amount = Number(sub.amount_cents);
    if (sub.billing_cycle === "yearly") return sum + Math.round(amount / 12);
    if (sub.billing_cycle === "weekly") return sum + Math.round(amount * 4.33);
    if (sub.billing_cycle === "quarterly") return sum + Math.round(amount / 3);
    return sum + amount;
  }, 0);

  // Hoje em America/Recife como YYYY-MM-DD pra comparar com next_charge_on (date).
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const daysUntil = (target: string | null) => {
    if (!target) return null;
    const a = Date.UTC(
      Number(todayStr.slice(0, 4)),
      Number(todayStr.slice(5, 7)) - 1,
      Number(todayStr.slice(8, 10))
    );
    const b = Date.UTC(
      Number(target.slice(0, 4)),
      Number(target.slice(5, 7)) - 1,
      Number(target.slice(8, 10))
    );
    return Math.round((b - a) / 86400000);
  };
  const dayMonthShort = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

  const incomeRow = monthSummary.totals.find((r) => r.type === "income");
  const expenseRow = monthSummary.totals.find((r) => r.type === "expense");
  const incomeCents = incomeRow ? Number(incomeRow.total) : 0;
  const expenseCentsSigned = expenseRow ? Number(expenseRow.total) : 0;
  const expenseCentsAbs = Math.abs(expenseCentsSigned);
  const balanceCents = incomeCents + expenseCentsSigned;
  const hasMovement = incomeCents !== 0 || expenseCentsSigned !== 0;

  const maxCategoryCents = monthSummary.topCategories.reduce(
    (max, c) => Math.max(max, Number(c.total)),
    0
  );

  // Sparkline: receitas vs gastos cumulativo do mês usando recentTx invertido.
  // Aproximação rápida — query dedicada de daily-balance pode vir depois.
  const sparkValues = (() => {
    const sorted = [...recentTx].reverse();
    let acc = 0;
    return sorted.map((tx) => {
      acc += Number(tx.amount_cents);
      return acc;
    });
  })();
  const spark = buildSparkPath(
    sparkValues.length > 1 ? sparkValues : [0, 0, 0, 0],
    240,
    44
  );

  const next = upcoming[0];

  return (
    <main
      className="relative mx-auto min-h-dvh max-w-2xl pb-24 text-white sm:pb-10 lg:max-w-6xl xl:max-w-7xl"
      style={{ background: "transparent" }}
    >
      <InteractiveBackground />
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-8">
        <div>
          <p className="text-xs" style={{ color: "oklch(0.78 0 0)" }}>
            {todayLabel()}
          </p>
          <h1
            className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontStretch: "92%" }}
          >
            {greeting()}{firstName ? `, ${firstName}` : ""}.
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/importar"
            className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_24px_oklch(0.92_0.22_155/0.25)]"
            title="Importar fatura"
            aria-label="Importar fatura"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12M7 8l5-5 5 5M3 21h18" />
            </svg>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 hover:border-white/30 hover:bg-white/10 hover:text-white hover:shadow-[0_0_24px_rgba(255,255,255,0.12)]"
              title="Sair"
              aria-label="Sair"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-3 px-4 sm:space-y-4 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-4 lg:space-y-0">
        {/* HERO — saldo total + mês */}
        <section
          className="rounded-3xl border p-5 sm:p-6 lg:col-span-7 lg:order-1"
          style={{
            background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(255,255,255,0.10)",
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 80px -40px rgba(0,0,0,0.7)",
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "oklch(0.78 0 0)" }}
          >
            saldo total
          </p>
          <p
            className="mt-2 text-4xl font-light tabular-nums tracking-tight sm:text-5xl lg:text-6xl"
            style={{ fontStretch: "90%" }}
          >
            {BRL.format(totalCents / 100)}
          </p>

          {sparkValues.length > 1 ? (
            <svg
              viewBox="0 0 240 44"
              preserveAspectRatio="none"
              className="mt-4 h-12 w-full overflow-visible lg:h-16"
              aria-hidden
              style={{
                filter:
                  "drop-shadow(0 0 6px oklch(0.85 0.20 155 / 0.55)) drop-shadow(0 0 14px oklch(0.85 0.20 155 / 0.25))",
              }}
            >
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0"
                    stopColor="oklch(0.88 0.22 155)"
                    stopOpacity="0.45"
                  />
                  <stop
                    offset="1"
                    stopColor="oklch(0.88 0.22 155)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path d={spark.area} fill="url(#sparkGrad)" />
              <path
                d={spark.line}
                fill="none"
                stroke="oklch(0.92 0.22 155)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div
              className="mt-4 h-12 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
          )}

          <div
            className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 sm:gap-6 sm:pt-5"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div>
              <p className="text-[11px]" style={{ color: "oklch(0.78 0 0)" }}>
                Receitas
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg text-emerald-400">
                {hasMovement ? `+ ${BRL.format(incomeCents / 100)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "oklch(0.78 0 0)" }}>
                Gastos
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg text-red-400">
                {hasMovement ? `− ${BRL.format(expenseCentsAbs / 100)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "oklch(0.78 0 0)" }}>
                Líquido {monthSummary.label.split(" ")[0]?.toLowerCase()}
              </p>
              <p
                className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${
                  balanceCents > 0
                    ? "text-emerald-400"
                    : balanceCents < 0
                      ? "text-red-400"
                      : "text-zinc-300"
                }`}
              >
                {hasMovement
                  ? `${balanceCents >= 0 ? "+ " : "− "}${BRL.format(Math.abs(balanceCents) / 100)}`
                  : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Favoritos — chips de templates 1-clique */}
        {favoriteTemplates.length > 0 ? (
          <section className="lg:col-span-12 lg:order-3">
            <p
              className="font-mono text-[10px] uppercase tracking-wider mb-2 px-1"
              style={{ color: "oklch(0.78 0 0)" }}
            >
              Favoritos
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
              {favoriteTemplates.map((tpl) => {
                const cents = Number(tpl.default_amount_cents);
                const isExpense = tpl.type === "expense";
                const swatch = tpl.color ?? "oklch(0.5 0.05 250)";
                return (
                  <form
                    key={tpl.id}
                    action={applyTemplate}
                    className="shrink-0"
                  >
                    <input type="hidden" name="template_id" value={tpl.id} />
                    <button
                      type="submit"
                      className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm backdrop-blur-xl transition-all duration-300 active:scale-[0.97]"
                      style={{
                        background: `color-mix(in oklch, ${swatch} 14%, rgba(255,255,255,0.04))`,
                        borderColor: `color-mix(in oklch, ${swatch} 30%, rgba(255,255,255,0.10))`,
                        boxShadow: `0 0 0 1px color-mix(in oklch, ${swatch} 8%, transparent) inset, 0 8px 24px -12px color-mix(in oklch, ${swatch} 60%, transparent)`,
                      }}
                    >
                      {tpl.icon ? (
                        <span className="text-base leading-none">
                          {tpl.icon}
                        </span>
                      ) : null}
                      <span className="text-zinc-100 whitespace-nowrap">
                        {tpl.name}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          isExpense ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {isExpense ? "− " : "+ "}
                        {BRL.format(cents / 100)}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Próximo plantão (highlight) */}
        {next ? (
          <section
            className="rounded-3xl border p-5 lg:col-span-5 lg:order-2"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.55 0.18 155 / 0.18), rgba(255,255,255,0.04) 60%)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderColor: "oklch(0.85 0.18 155 / 0.30)",
              boxShadow:
                "0 0 0 1px oklch(0.85 0.18 155 / 0.10) inset, 0 24px 60px -30px oklch(0.85 0.18 155 / 0.40)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                próximo plantão
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p
                className="text-lg font-semibold sm:text-xl"
                style={{ fontStretch: "92%" }}
              >
                {dayShort.format(new Date(next.starts_at))}
                {", "}
                {timeShort.format(new Date(next.starts_at))}
              </p>
              <p className="text-xs" style={{ color: "oklch(0.88 0 0)" }}>
                até {timeShort.format(new Date(next.ends_at))}
              </p>
            </div>
            <p
              className="mt-1 text-sm"
              style={{ color: "oklch(0.88 0 0)" }}
            >
              {next.title ?? next.workplace_name ?? "Local desconhecido"}
              {next.title && next.workplace_name
                ? ` · ${next.workplace_name}`
                : ""}
            </p>
            {next.pay_cents ? (
              <p
                className="mt-2 text-xs tabular-nums"
                style={{ color: "oklch(0.88 0 0)" }}
              >
                {BRL.format(Number(next.pay_cents) / 100)}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Top categorias */}
        {monthSummary.topCategories.length > 0 ? (
          <section
            className="rounded-3xl border p-5 sm:p-6 lg:col-span-5 lg:order-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                className="text-base font-medium"
                style={{ fontStretch: "94%" }}
              >
                Onde foi
              </h2>
              <p className="text-xs" style={{ color: "oklch(0.78 0 0)" }}>
                {monthSummary.label.split(" ")[0]?.toLowerCase()}
              </p>
            </div>
            <ul className="space-y-3">
              {monthSummary.topCategories.map((cat) => {
                const cents = Number(cat.total);
                const pct =
                  maxCategoryCents > 0
                    ? Math.max(4, Math.round((cents / maxCategoryCents) * 100))
                    : 0;
                const name = cat.category_name ?? "Sem categoria";
                const key = cat.category_id ?? "uncategorized";
                const swatchColor = cat.category_color ?? "oklch(0.6 0.05 250)";
                return (
                  <li key={key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            background: swatchColor,
                            boxShadow: `0 0 8px ${swatchColor}, 0 0 2px ${swatchColor}`,
                          }}
                        />
                        <span className="truncate">
                          {cat.category_icon &&
                          !/^[a-z0-9_-]+$/i.test(cat.category_icon)
                            ? `${cat.category_icon} `
                            : ""}
                          {name}
                        </span>
                      </span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{ color: "oklch(0.88 0 0)" }}
                      >
                        {BRL.format(cents / 100)}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, color-mix(in oklch, ${swatchColor} 70%, transparent), ${swatchColor})`,
                          boxShadow: `0 0 12px ${swatchColor}, inset 0 1px 0 rgba(255,255,255,0.25)`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Assinaturas */}
        <section
          className="rounded-3xl border p-5 sm:p-6 lg:col-span-7 lg:order-6"
          style={{
            background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2
              className="text-base font-medium"
              style={{ fontStretch: "94%" }}
            >
              Assinaturas
            </h2>
            <p
              className="shrink-0 text-xs tabular-nums"
              style={{ color: "oklch(0.78 0 0)" }}
            >
              {activeSubscriptions.length === 0
                ? "—"
                : `${activeSubscriptions.length} ativa${activeSubscriptions.length === 1 ? "" : "s"} · ${BRL.format(subsMonthlyCents / 100)}/mês`}
            </p>
          </div>
          {activeSubscriptions.length === 0 ? (
            <p
              className="rounded-2xl border px-4 py-6 text-center text-xs"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.10)",
                color: "oklch(0.78 0 0)",
              }}
            >
              Nenhuma assinatura cadastrada. Use /assinatura no Telegram (em breve).
            </p>
          ) : (
            <ul className="space-y-3">
              {activeSubscriptions.map((sub) => {
                const swatchColor = sub.color ?? "oklch(0.6 0.05 250)";
                const initial = sub.name.trim().charAt(0).toUpperCase();
                const days = daysUntil(sub.next_charge_on);
                const isYearly = sub.billing_cycle === "yearly";
                const due =
                  sub.next_charge_on === null
                    ? null
                    : days !== null && days < 0
                      ? "atrasada"
                      : days === 0
                        ? "hoje"
                        : days === 1
                          ? "amanhã"
                          : `${dayMonthShort.format(new Date(`${sub.next_charge_on}T00:00:00Z`)).replace(".", "")}`;
                const dueColor =
                  days !== null && days <= 3
                    ? "text-amber-300"
                    : undefined;
                return (
                  <li
                    key={sub.id}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-medium ring-1 ring-inset"
                      style={{
                        background: `color-mix(in oklch, ${swatchColor} 22%, transparent)`,
                        color: swatchColor,
                        boxShadow: `0 0 14px color-mix(in oklch, ${swatchColor} 35%, transparent)`,
                        ["--tw-ring-color" as string]: `color-mix(in oklch, ${swatchColor} 30%, transparent)`,
                      }}
                      aria-hidden
                    >
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-sm">{sub.name}</p>
                        {isYearly ? (
                          <span
                            className="shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              borderColor: "rgba(255,255,255,0.10)",
                              color: "oklch(0.88 0 0)",
                            }}
                          >
                            anual
                          </span>
                        ) : null}
                      </div>
                      {due ? (
                        <p
                          className={`text-[11px] ${dueColor ?? ""}`}
                          style={
                            dueColor ? undefined : { color: "oklch(0.78 0 0)" }
                          }
                        >
                          próxima {due}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {BRL.format(Number(sub.amount_cents) / 100)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Transações recentes */}
        <section
          className="rounded-3xl border p-5 sm:p-6 lg:col-span-7 lg:order-5"
          style={{
            background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              className="text-base font-medium"
              style={{ fontStretch: "94%" }}
            >
              Atividade recente
            </h2>
            <p className="text-xs" style={{ color: "oklch(0.78 0 0)" }}>
              {recentTx.length > 0 ? `${recentTx.length} últimas` : "—"}
            </p>
          </div>
          {recentTx.length === 0 ? (
            <p
              className="rounded-2xl border px-4 py-6 text-center text-xs"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.10)",
                color: "oklch(0.78 0 0)",
              }}
            >
              Nenhuma transação ainda. Capture pelo Telegram.
            </p>
          ) : (
            <ul className="-mx-1 divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {recentTx.map((tx) => {
                const cents = Number(tx.amount_cents);
                const isIncome = tx.type === "income" || cents > 0;
                const value = BRL.format(Math.abs(cents) / 100);
                const swatchColor =
                  tx.category_color ??
                  (isIncome ? "oklch(0.85 0.16 155)" : "oklch(0.74 0.16 25)");
                return (
                  <li
                    key={tx.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl text-sm ring-1 ring-inset"
                      style={{
                        background: `color-mix(in oklch, ${swatchColor} 22%, transparent)`,
                        boxShadow: `0 0 12px color-mix(in oklch, ${swatchColor} 30%, transparent)`,
                        ["--tw-ring-color" as string]: `color-mix(in oklch, ${swatchColor} 25%, transparent)`,
                      }}
                      aria-hidden
                    >
                      {tx.category_icon && !/^[a-z0-9_-]+$/i.test(tx.category_icon)
                        ? tx.category_icon
                        : isIncome
                          ? "↑"
                          : "↓"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{tx.description}</p>
                      <p
                        className="truncate text-[11px]"
                        style={{ color: "oklch(0.78 0 0)" }}
                      >
                        {dateLong.format(new Date(tx.occurred_on))}
                        {tx.category_name ? ` · ${tx.category_name}` : ""}
                        {tx.account_name ? ` · ${tx.account_name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        isIncome ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isIncome ? "+ " : "− "}
                      {value}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Plantões próximos (lista) */}
        {upcoming.length > 1 ? (
          <section
            className="rounded-3xl border p-5 sm:p-6 lg:col-span-5 lg:order-7"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                className="text-base font-medium"
                style={{ fontStretch: "94%" }}
              >
                Próximos plantões
              </h2>
              <p className="text-xs" style={{ color: "oklch(0.78 0 0)" }}>
                {upcoming.length} agendados
              </p>
            </div>
            <ul className="space-y-3">
              {upcoming.slice(1).map((sh) => {
                const start = new Date(sh.starts_at);
                const end = new Date(sh.ends_at);
                const pay = sh.pay_cents
                  ? BRL.format(Number(sh.pay_cents) / 100)
                  : null;
                const place =
                  sh.workplace_short ??
                  sh.workplace_name ??
                  "Local desconhecido";
                return (
                  <li key={sh.id} className="flex items-start gap-4">
                    <div className="w-12 shrink-0 text-center">
                      <p
                        className="font-mono text-[10px] uppercase"
                        style={{ color: "oklch(0.78 0 0)" }}
                      >
                        {dayShort.format(start).replace(".", "")}
                      </p>
                      <p
                        className="text-lg font-semibold tabular-nums"
                        style={{ fontStretch: "90%" }}
                      >
                        {dayNumber.format(start)}
                      </p>
                    </div>
                    <div
                      className="flex-1 rounded-2xl border px-4 py-3"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-medium">
                          {sh.title ?? place}
                        </p>
                        <span
                          className="text-xs"
                          style={{ color: "oklch(0.78 0 0)" }}
                        >
                          {timeShort.format(start)} → {timeShort.format(end)}
                        </span>
                      </div>
                      {sh.title && sh.workplace_name ? (
                        <p
                          className="text-xs"
                          style={{ color: "oklch(0.78 0 0)" }}
                        >
                          {sh.workplace_name}
                        </p>
                      ) : null}
                      {pay ? (
                        <p
                          className="mt-1.5 text-xs tabular-nums"
                          style={{ color: "oklch(0.88 0 0)" }}
                        >
                          {pay}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Footer */}
      <p
        className="mt-6 px-6 text-center text-[11px]"
        style={{ color: "oklch(0.42 0.006 30)" }}
      >
        Capturando por Telegram · {user.email}
      </p>
    </main>
  );
}
