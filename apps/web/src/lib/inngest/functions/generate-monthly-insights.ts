/**
 * Cron Inngest mensal — gera insight `monthly_summary` pra cada usuário
 * que teve movimentação no mês anterior.
 *
 * Trigger duplo:
 *   - cron: 1º dia do mês às 06:00 America/Recife (= 09:00 UTC)
 *   - event "insights/monthly.generate": disparo manual com data: { user_id, period_start, period_end }
 *
 * Pipeline pra cada user:
 *   1. Skip se já existe insight do mesmo period_start
 *   2. Carrega stats SQL (totals, top categorias, plantões, dedutíveis CL)
 *   3. Skip se nenhuma transação
 *   4. Monta markdown com números + 1 parágrafo de comentário gerado por LLM
 *   5. INSERT insight
 *   6. (Opcional) Notify via Telegram se chat vinculado
 */
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import {
  categories,
  insights,
  shifts,
  telegramUsers,
  transactions,
  workplaces,
} from "@agendario/db";
import { inngest } from "../client";
import { serverEnv } from "@/env";
import { getDb } from "@/lib/db";
import { getOpenAI } from "@/lib/openai/client";
import { sendMessage } from "@/lib/telegram/api";

type MonthBounds = {
  year: number;
  month: number;
  startStr: string;
  endStr: string;
  label: string;
};

function previousMonthBounds(now: Date = new Date()): MonthBounds {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const currentYear = Number(parts.find((p) => p.type === "year")!.value);
  const currentMonth = Number(parts.find((p) => p.type === "month")!.value);
  const month = currentMonth === 1 ? 12 : currentMonth - 1;
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endStr = `${nextYear}-${pad(nextMonth)}-01`;
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
  return { year, month, startStr, endStr, label };
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type UserStats = {
  income_cents: number;
  expense_cents_signed: number;
  transaction_count: number;
  shift_count: number;
  shift_pay_cents: number;
  top_categories: { name: string; total_cents: number; deductible: boolean }[];
  top_workplaces: { name: string; pay_cents: number; count: number }[];
  carne_leao_cents: number;
};

async function loadUserStats(
  userId: string,
  startStr: string,
  endStr: string
): Promise<UserStats | null> {
  const db = getDb();

  const totals = await db
    .select({
      type: transactions.type,
      total: sql<string>`SUM(${transactions.amount_cents})`,
      count: count(transactions.id),
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

  const incomeRow = totals.find((r) => r.type === "income");
  const expenseRow = totals.find((r) => r.type === "expense");
  const incomeCents = incomeRow ? Number(incomeRow.total) : 0;
  const expenseCentsSigned = expenseRow ? Number(expenseRow.total) : 0;
  const txCount =
    (incomeRow ? Number(incomeRow.count) : 0) +
    (expenseRow ? Number(expenseRow.count) : 0);

  if (txCount === 0) return null;

  const topCats = await db
    .select({
      name: categories.name,
      deductible: categories.deductible_carne_leao,
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
    .groupBy(categories.id, categories.name, categories.deductible_carne_leao)
    .orderBy(desc(sql`SUM(ABS(${transactions.amount_cents}))`))
    .limit(5);

  const carneLeaoRow = await db
    .select({
      total: sql<string>`COALESCE(SUM(ABS(${transactions.amount_cents})), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.category_id))
    .where(
      and(
        eq(transactions.user_id, userId),
        eq(transactions.type, "expense"),
        eq(categories.deductible_carne_leao, true),
        gte(transactions.occurred_on, startStr),
        lt(transactions.occurred_on, endStr)
      )
    );

  const shiftStats = await db
    .select({
      total: sql<string>`COALESCE(SUM(${shifts.pay_cents}), 0)`,
      count: count(shifts.id),
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.user_id, userId),
        gte(shifts.starts_at, new Date(`${startStr}T00:00:00.000Z`)),
        lt(shifts.starts_at, new Date(`${endStr}T00:00:00.000Z`))
      )
    );

  const topWp = await db
    .select({
      name: workplaces.name,
      pay: sql<string>`COALESCE(SUM(${shifts.pay_cents}), 0)`,
      count: count(shifts.id),
    })
    .from(shifts)
    .innerJoin(workplaces, eq(workplaces.id, shifts.workplace_id))
    .where(
      and(
        eq(shifts.user_id, userId),
        gte(shifts.starts_at, new Date(`${startStr}T00:00:00.000Z`)),
        lt(shifts.starts_at, new Date(`${endStr}T00:00:00.000Z`))
      )
    )
    .groupBy(workplaces.id, workplaces.name)
    .orderBy(desc(sql`COALESCE(SUM(${shifts.pay_cents}), 0)`))
    .limit(3);

  return {
    income_cents: incomeCents,
    expense_cents_signed: expenseCentsSigned,
    transaction_count: txCount,
    shift_count: shiftStats[0] ? Number(shiftStats[0].count) : 0,
    shift_pay_cents: shiftStats[0] ? Number(shiftStats[0].total) : 0,
    top_categories: topCats.map((c) => ({
      name: c.name ?? "Sem categoria",
      total_cents: Number(c.total),
      deductible: c.deductible ?? false,
    })),
    top_workplaces: topWp.map((w) => ({
      name: w.name,
      pay_cents: Number(w.pay),
      count: Number(w.count),
    })),
    carne_leao_cents: Number(carneLeaoRow[0]?.total ?? 0),
  };
}

async function generateCommentary(
  stats: UserStats,
  monthLabel: string
): Promise<string> {
  if (!serverEnv.OPENAI_API_KEY) return "";

  const balance = stats.income_cents + stats.expense_cents_signed;
  const expenseAbs = Math.abs(stats.expense_cents_signed);
  const savingsRate =
    stats.income_cents > 0
      ? Math.round((balance / stats.income_cents) * 100)
      : null;

  const prompt = [
    `Mês: ${monthLabel}`,
    `Receitas: ${BRL.format(stats.income_cents / 100)} (${stats.shift_count} plantões)`,
    `Gastos: ${BRL.format(expenseAbs / 100)} (${stats.transaction_count} transações)`,
    `Saldo: ${BRL.format(balance / 100)}${
      savingsRate !== null ? ` (${savingsRate}% poupado da receita)` : ""
    }`,
    `Top gastos: ${stats.top_categories
      .slice(0, 3)
      .map((c) => `${c.name} ${BRL.format(c.total_cents / 100)}`)
      .join(", ")}`,
    stats.carne_leao_cents > 0
      ? `Dedutível carnê-leão: ${BRL.format(stats.carne_leao_cents / 100)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: serverEnv.OPENAI_MODEL_INSIGHTS,
      messages: [
        {
          role: "system",
          content:
            "Você é um conselheiro financeiro pessoal, conciso, em português brasileiro. " +
            "Escreva 2 frases curtas comentando o resumo do mês de um médico intensivista. " +
            "Sem clichês, sem bullets, sem exclamações. Tom: parceiro analítico, opinionado quando útil. " +
            "Foque em algo acionável (uma observação interessante OU uma sugestão).",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 180,
    });
    return completion.choices[0]?.message.content?.trim() ?? "";
  } catch (err) {
    console.error("[insights] LLM commentary failed", err);
    return "";
  }
}

function buildMarkdown(
  stats: UserStats,
  monthLabel: string,
  commentary: string
): string {
  const balance = stats.income_cents + stats.expense_cents_signed;
  const expenseAbs = Math.abs(stats.expense_cents_signed);

  const lines: string[] = [];
  lines.push(`# ${monthLabel}`);
  lines.push("");
  lines.push(`**Receitas:** ${BRL.format(stats.income_cents / 100)}`);
  lines.push(`**Gastos:** ${BRL.format(expenseAbs / 100)}`);
  lines.push(`**Saldo:** ${BRL.format(balance / 100)}`);
  lines.push("");

  if (stats.shift_count > 0) {
    lines.push(
      `**${stats.shift_count} plantões** · ${BRL.format(stats.shift_pay_cents / 100)}`
    );
    if (stats.top_workplaces.length > 0) {
      lines.push("");
      for (const wp of stats.top_workplaces) {
        lines.push(
          `- ${wp.name} · ${wp.count}× · ${BRL.format(wp.pay_cents / 100)}`
        );
      }
    }
    lines.push("");
  }

  if (stats.top_categories.length > 0) {
    lines.push("## Top categorias");
    for (const cat of stats.top_categories) {
      const tag = cat.deductible ? " · `CL`" : "";
      lines.push(`- ${cat.name} · ${BRL.format(cat.total_cents / 100)}${tag}`);
    }
    lines.push("");
  }

  if (stats.carne_leao_cents > 0) {
    lines.push(
      `**Dedutível carnê-leão:** ${BRL.format(stats.carne_leao_cents / 100)}`
    );
    lines.push("");
  }

  if (commentary) {
    lines.push("---");
    lines.push("");
    lines.push(commentary);
  }

  return lines.join("\n");
}

async function processUser(
  userId: string,
  bounds: MonthBounds,
  forceRegenerate: boolean
): Promise<{ inserted: boolean; reason?: string }> {
  const db = getDb();

  if (!forceRegenerate) {
    const [existing] = await db
      .select({ id: insights.id })
      .from(insights)
      .where(
        and(
          eq(insights.user_id, userId),
          eq(insights.kind, "monthly_summary"),
          eq(insights.period_start, bounds.startStr)
        )
      )
      .limit(1);
    if (existing) return { inserted: false, reason: "already_exists" };
  }

  const stats = await loadUserStats(userId, bounds.startStr, bounds.endStr);
  if (!stats) return { inserted: false, reason: "no_movement" };

  const commentary = await generateCommentary(stats, bounds.label);
  const markdown = buildMarkdown(stats, bounds.label, commentary);

  await db.insert(insights).values({
    user_id: userId,
    kind: "monthly_summary",
    period_start: bounds.startStr,
    period_end: bounds.endStr,
    title: `Resumo de ${bounds.label}`,
    summary_markdown: markdown,
    payload: stats as never,
    llm_model: commentary ? serverEnv.OPENAI_MODEL_INSIGHTS : null,
  });

  // Notifica via Telegram se vinculado
  const [tg] = await db
    .select({ chat_id: telegramUsers.telegram_chat_id })
    .from(telegramUsers)
    .where(
      and(
        eq(telegramUsers.user_id, userId),
        eq(telegramUsers.is_active, true)
      )
    )
    .limit(1);

  if (tg?.chat_id) {
    const balance = stats.income_cents + stats.expense_cents_signed;
    const expenseAbs = Math.abs(stats.expense_cents_signed);
    try {
      await sendMessage({
        chat_id: tg.chat_id,
        text: [
          `📊 *Resumo de ${bounds.label}*`,
          "",
          `Receitas: ${BRL.format(stats.income_cents / 100)}`,
          `Gastos: ${BRL.format(expenseAbs / 100)}`,
          `Saldo: ${BRL.format(balance / 100)}`,
          stats.shift_count > 0 ? `Plantões: ${stats.shift_count}` : null,
          stats.carne_leao_cents > 0
            ? `Dedutível CL: ${BRL.format(stats.carne_leao_cents / 100)}`
            : null,
          commentary ? "" : null,
          commentary ? commentary : null,
        ]
          .filter((v) => v !== null)
          .join("\n"),
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("[insights] telegram notify failed", err);
    }
  }

  return { inserted: true };
}

/**
 * Cron mensal: 1º dia do mês às 06:00 America/Recife (09:00 UTC).
 * Inngest aceita prefix "TZ=America/Recife" pra cron-tz aware.
 */
export const generateMonthlyInsightsCron = inngest.createFunction(
  { id: "generate-monthly-insights-cron", retries: 1 },
  { cron: "TZ=America/Recife 0 6 1 * *" },
  async ({ step, logger }) => {
    const bounds = previousMonthBounds();
    logger.info("Starting monthly insights cron", { period: bounds.startStr });

    // Quem tem transactions no período → candidatos a insight
    const candidates = await step.run("load-candidates", async () => {
      const db = getDb();
      return await db
        .selectDistinct({ user_id: transactions.user_id })
        .from(transactions)
        .where(
          and(
            gte(transactions.occurred_on, bounds.startStr),
            lt(transactions.occurred_on, bounds.endStr)
          )
        );
    });

    let inserted = 0;
    let skipped = 0;
    for (const { user_id } of candidates) {
      const result = await step.run(`process-${user_id}`, async () => {
        try {
          return await processUser(user_id, bounds, false);
        } catch (err) {
          logger.error("[insights] processUser failed", { user_id, err });
          return { inserted: false, reason: "error" };
        }
      });
      if (result.inserted) inserted += 1;
      else skipped += 1;
    }

    logger.info("Monthly insights cron done", { inserted, skipped });
    return { inserted, skipped, candidates: candidates.length };
  }
);

/**
 * Trigger manual via evento. Útil pra teste e regerar sob demanda.
 * data: { user_id, period_start, period_end }
 */
export const generateMonthlyInsightsOnDemand = inngest.createFunction(
  { id: "generate-monthly-insights-on-demand", retries: 1 },
  { event: "insights/monthly.generate" },
  async ({ event, step }) => {
    const { user_id, period_start, period_end } = event.data;

    const startDate = new Date(`${period_start}T00:00:00.000Z`);
    const year = startDate.getUTCFullYear();
    const month = startDate.getUTCMonth() + 1;
    const monthName = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "UTC",
    }).format(startDate);
    const bounds: MonthBounds = {
      year,
      month,
      startStr: period_start,
      endStr: period_end,
      label: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`,
    };

    return await step.run("process", async () => {
      return await processUser(user_id, bounds, true);
    });
  }
);
