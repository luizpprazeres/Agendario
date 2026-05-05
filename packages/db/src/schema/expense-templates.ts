import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  idColumn,
  timestampsColumns,
  transactionTypeEnum,
  userIdColumn,
} from "./_shared";
import { categories, financialAccounts } from "./financial";
import { workplaces } from "./workplaces";

/**
 * Templates de transação 1-clique ("favoritos").
 *
 * Aplicado via server action: cria transaction com os defaults preenchidos,
 * incrementa usage_count e last_used_at. Disparar
 * `transactions/categorize-requested` apenas se template.default_category_id
 * for null.
 *
 * Valor SEMPRE positivo aqui — sinal é aplicado em runtime conforme `type`.
 */
export const expenseTemplates = pgTable(
  "expense_templates",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    // Label visível (ex: "Combustível Shell"). Ícone separado em `icon`.
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    // Descrição que vai pra transaction criada (ex: "Posto Shell · Caxangá")
    description_template: text("description_template").notNull(),
    type: transactionTypeEnum("type").notNull().default("expense"),
    default_amount_cents: decimal("default_amount_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    default_account_id: uuid("default_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" }
    ),
    default_category_id: uuid("default_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    default_workplace_id: uuid("default_workplace_id").references(
      () => workplaces.id,
      { onDelete: "set null" }
    ),
    notes: text("notes"),
    sort_order: integer("sort_order").notNull().default(0),
    usage_count: integer("usage_count").notNull().default(0),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    is_archived: boolean("is_archived").notNull().default(false),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userActiveIdx: index("templates_user_active_idx").on(
      t.user_id,
      t.is_archived
    ),
    userUsageIdx: index("templates_user_usage_idx").on(
      t.user_id,
      t.usage_count
    ),
  })
);

export type ExpenseTemplate = typeof expenseTemplates.$inferSelect;
export type NewExpenseTemplate = typeof expenseTemplates.$inferInsert;
