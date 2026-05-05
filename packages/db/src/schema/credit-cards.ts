import { sql } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, userIdColumn } from "./_shared";
import { categories, financialAccounts } from "./financial";

/**
 * Parcelamentos ativos no cartão de crédito.
 * Cada compra parcelada gera 1 row aqui + N transactions (uma por parcela).
 * total_cents = preço total da compra
 * installment_cents = valor de cada parcela
 */
export const creditCardInstallments = pgTable(
  "credit_card_installments",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    vendor: text("vendor"),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    total_cents: decimal("total_cents", { precision: 14, scale: 0 }).notNull(),
    installment_count: integer("installment_count").notNull(),
    installment_cents: decimal("installment_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    first_charge_on: date("first_charge_on").notNull(),
    // Quantas parcelas já foram cobradas (denormalizado pra simplificar dashboard)
    paid_installments: integer("paid_installments").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userAccountIdx: index("cc_installments_user_account_idx").on(
      t.user_id,
      t.account_id
    ),
  })
);

export type CreditCardInstallment = typeof creditCardInstallments.$inferSelect;
export type NewCreditCardInstallment =
  typeof creditCardInstallments.$inferInsert;
