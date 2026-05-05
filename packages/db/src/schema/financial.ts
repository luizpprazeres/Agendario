import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accountTypeEnum,
  idColumn,
  ruleActionTypeEnum,
  ruleConditionTypeEnum,
  timestampsColumns,
  transactionStatusEnum,
  transactionTypeEnum,
  userIdColumn,
} from "./_shared";
import { workplaces } from "./workplaces";

/**
 * Contas financeiras — checking, credit_card, savings, etc.
 */
export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    institution: text("institution"),
    currency: text("currency").notNull().default("BRL"),
    // Saldo "computed" — opcional (pode ser recalculado de transactions)
    initial_balance_cents: decimal("initial_balance_cents", {
      precision: 14,
      scale: 0,
    })
      .notNull()
      .default("0"),
    color: text("color"),
    is_archived: boolean("is_archived").notNull().default(false),
    // Credit card específicos — nullable, só preenchidos quando type='credit_card'
    cc_closing_day: smallint("cc_closing_day"),
    cc_due_day: smallint("cc_due_day"),
    cc_limit_cents: decimal("cc_limit_cents", { precision: 14, scale: 0 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userIdx: index("fin_accounts_user_idx").on(t.user_id),
  })
);

/**
 * Categorias — hierárquicas (parent_id), com flag carnê-leão para dedução.
 */
export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    parent_id: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon"),
    color: text("color"),
    // Tipo dominante: income, expense, transfer
    type: transactionTypeEnum("type").notNull(),
    // Para área médica: gasto dedutível em carnê-leão (consultórios, equipamentos, congressos)
    deductible_carne_leao: boolean("deductible_carne_leao")
      .notNull()
      .default(false),
    is_system: boolean("is_system").notNull().default(false),
    sort_order: decimal("sort_order", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    ...timestampsColumns(),
  },
  (t) => ({
    userSlugUnique: uniqueIndex("categories_user_slug_unique").on(
      t.user_id,
      t.slug
    ),
    parentIdx: index("categories_parent_idx").on(t.parent_id),
  })
);

/**
 * Transações financeiras (modelo simplificado — single-entry para MVP).
 * Suporta transferências via `transfer_pair_id`.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    workplace_id: uuid("workplace_id").references(() => workplaces.id, {
      onDelete: "set null",
    }),
    type: transactionTypeEnum("type").notNull(),
    status: transactionStatusEnum("status").notNull().default("cleared"),
    // Valor SEMPRE em centavos (BRL). Sinal: + entrada, - saída
    amount_cents: decimal("amount_cents", { precision: 14, scale: 0 }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    description: text("description").notNull(),
    notes: text("notes"),
    occurred_on: date("occurred_on").notNull(),
    cleared_on: date("cleared_on"),
    // Para transferência: aponta para a contraparte (mesma transação espelhada)
    transfer_pair_id: uuid("transfer_pair_id"),
    // Origem do registro (manual, telegram, csv_import, ofx_import, rule)
    source: text("source").notNull().default("manual"),
    external_id: text("external_id"),
    // FITID do OFX, hash do CSV, message_id do Telegram
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    locked_attributes: jsonb("locked_attributes")
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Confiança da categorização automática (0..1) e camada que aplicou (rule, cache, llm)
    auto_categorized_by: text("auto_categorized_by"),
    auto_confidence: decimal("auto_confidence", { precision: 5, scale: 4 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userDateIdx: index("transactions_user_date_idx").on(
      t.user_id,
      t.occurred_on
    ),
    accountIdx: index("transactions_account_idx").on(t.account_id),
    categoryIdx: index("transactions_category_idx").on(t.category_id),
    externalUnique: uniqueIndex("transactions_external_unique").on(
      t.user_id,
      t.account_id,
      t.external_id
    ),
  })
);

/**
 * Orçamentos (budgets) — limite mensal/semanal por categoria.
 */
export const budgets = pgTable("budgets", {
  id: idColumn(),
  user_id: userIdColumn(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  // 'monthly' | 'weekly' | 'yearly'
  period: text("period").notNull().default("monthly"),
  amount_cents: decimal("amount_cents", { precision: 14, scale: 0 }).notNull(),
  starts_on: date("starts_on").notNull(),
  ends_on: date("ends_on"),
  rollover: boolean("rollover").notNull().default(false),
  ...timestampsColumns(),
});

/**
 * Metas financeiras — economia de longo prazo.
 */
export const financialGoals = pgTable("financial_goals", {
  id: idColumn(),
  user_id: userIdColumn(),
  account_id: uuid("account_id").references(() => financialAccounts.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  target_amount_cents: decimal("target_amount_cents", {
    precision: 14,
    scale: 0,
  }).notNull(),
  current_amount_cents: decimal("current_amount_cents", {
    precision: 14,
    scale: 0,
  })
    .notNull()
    .default("0"),
  target_date: date("target_date"),
  status: text("status").notNull().default("active"),
  ...timestampsColumns(),
});

/**
 * Rule engine para categorização automática.
 * Conditions e actions armazenados como (type, value) — inspirado no Firefly III.
 */
export const rules = pgTable(
  "rules",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    description: text("description"),
    is_active: boolean("is_active").notNull().default(true),
    // Ordem de avaliação (menor = mais prioridade)
    priority: decimal("priority", { precision: 10, scale: 2 })
      .notNull()
      .default("100"),
    // Se true, para de avaliar regras seguintes ao matchear
    stop_processing: boolean("stop_processing").notNull().default(false),
    ...timestampsColumns(),
  },
  (t) => ({
    userActiveIdx: index("rules_user_active_idx").on(t.user_id, t.is_active),
  })
);

export const ruleConditions = pgTable("rule_conditions", {
  id: idColumn(),
  rule_id: uuid("rule_id")
    .notNull()
    .references(() => rules.id, { onDelete: "cascade" }),
  type: ruleConditionTypeEnum("type").notNull(),
  // value é sempre string — converter conforme type ao avaliar
  value: text("value").notNull(),
  // Para amount_between: secondary_value
  secondary_value: text("secondary_value"),
  negate: boolean("negate").notNull().default(false),
});

export const ruleActions = pgTable("rule_actions", {
  id: idColumn(),
  rule_id: uuid("rule_id")
    .notNull()
    .references(() => rules.id, { onDelete: "cascade" }),
  type: ruleActionTypeEnum("type").notNull(),
  value: text("value").notNull(),
});

/**
 * Cache de categorização LLM — chave é a descrição normalizada.
 * Acelera categorização repetida (ex: "ifood" sempre cai em "alimentação > delivery").
 */
export const categoryCache = pgTable("category_cache", {
  id: idColumn(),
  user_id: userIdColumn(),
  // Descrição normalizada (lowercase, sem acentos, sem números)
  description_key: text("description_key").notNull(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  // Quantas vezes usuário CONFIRMOU (não overrode) essa associação
  hit_count: decimal("hit_count", { precision: 10, scale: 0 })
    .notNull()
    .default("0"),
  last_used_at: timestamp("last_used_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  ...timestampsColumns(),
}, (t) => ({
  userKeyUnique: uniqueIndex("category_cache_unique").on(
    t.user_id,
    t.description_key
  ),
}));

export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type FinancialGoal = typeof financialGoals.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type RuleCondition = typeof ruleConditions.$inferSelect;
export type RuleAction = typeof ruleActions.$inferSelect;
export type CategoryCacheEntry = typeof categoryCache.$inferSelect;
