import { sql } from "drizzle-orm";
import { pgEnum, pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Helpers compartilhados — colunas padrão e enums globais.
 */

// Referência cross-schema para auth.users do Supabase.
// Apenas declarado, não gerenciado por nossas migrations.
export const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const idColumn = () =>
  uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const userIdColumn = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

export const timestampsColumns = () => ({
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// --- Enums ---

export const intentEnum = pgEnum("inbox_intent", [
  "task",
  "shift",
  "transaction",
  "note",
  "unknown",
]);

export const inboxStatusEnum = pgEnum("inbox_status", [
  "pending",
  "confirmed",
  "rejected",
  "expired",
]);

export const channelEnum = pgEnum("inbox_channel", [
  "telegram",
  "whatsapp",
  "web",
  "email",
  "csv_import",
  "ofx_import",
]);

export const shiftStatusEnum = pgEnum("shift_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "swapped",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
  "cancelled",
  "deferred",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "other",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "cleared",
  "reconciled",
  "void",
]);

export const ruleConditionTypeEnum = pgEnum("rule_condition_type", [
  "description_contains",
  "description_regex",
  "amount_eq",
  "amount_gt",
  "amount_lt",
  "amount_between",
  "account_eq",
  "weekday_eq",
]);

export const ruleActionTypeEnum = pgEnum("rule_action_type", [
  "set_category",
  "add_tag",
  "set_workplace",
  "mark_deductible",
  "split_amount",
]);

export const recurrenceFreqEnum = pgEnum("recurrence_freq", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom_rrule",
]);

export const insightKindEnum = pgEnum("insight_kind", [
  "monthly_summary",
  "shift_finance_correlation",
  "cashflow_projection",
  "carne_leao_export",
  "anomaly_alert",
]);
