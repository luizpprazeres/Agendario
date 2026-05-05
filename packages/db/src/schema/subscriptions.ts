import { sql } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, userIdColumn } from "./_shared";
import { categories, financialAccounts } from "./financial";

/**
 * Assinaturas recorrentes (Spotify, Netflix, software, planos).
 * billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
 * status: 'active' | 'paused' | 'cancelled'
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    // Vendor canônico para deduplicação (ex: "spotify", "netflix")
    vendor: text("vendor"),
    amount_cents: decimal("amount_cents", { precision: 14, scale: 0 }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    billing_cycle: text("billing_cycle").notNull().default("monthly"),
    next_charge_on: date("next_charge_on"),
    started_on: date("started_on"),
    cancelled_on: date("cancelled_on"),
    status: text("status").notNull().default("active"),
    account_id: uuid("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    color: text("color"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("subs_user_status_idx").on(t.user_id, t.status),
    userNextChargeIdx: index("subs_user_next_charge_idx").on(
      t.user_id,
      t.next_charge_on
    ),
    userVendorUnique: uniqueIndex("subs_user_vendor_unique").on(
      t.user_id,
      t.vendor
    ),
  })
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
