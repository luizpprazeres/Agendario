import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  idColumn,
  insightKindEnum,
  timestampsColumns,
  userIdColumn,
} from "./_shared";

/**
 * Insights gerados (mensais, correlações, projeções).
 * Conteúdo principal em markdown + dados estruturados em payload.
 */
export const insights = pgTable(
  "insights",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    kind: insightKindEnum("kind").notNull(),
    period_start: date("period_start"),
    period_end: date("period_end"),
    title: text("title").notNull(),
    summary_markdown: text("summary_markdown").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    // Modelo usado e custo
    llm_model: text("llm_model"),
    cost_cents_estimate: text("cost_cents_estimate"),
    generated_at: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    is_pinned: text("is_pinned").notNull().default("false"),
    ...timestampsColumns(),
  },
  (t) => ({
    userKindIdx: index("insights_user_kind_idx").on(t.user_id, t.kind),
    userPeriodIdx: index("insights_user_period_idx").on(
      t.user_id,
      t.period_start
    ),
  })
);

export type Insight = typeof insights.$inferSelect;
export type NewInsight = typeof insights.$inferInsert;
