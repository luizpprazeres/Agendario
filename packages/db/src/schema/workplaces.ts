import { sql } from "drizzle-orm";
import {
  decimal,
  index,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import {
  idColumn,
  timestampsColumns,
  userIdColumn,
} from "./_shared";

/**
 * Locais de trabalho — hospitais, clínicas, plantões fixos, etc.
 */
export const workplaces = pgTable(
  "workplaces",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    short_name: text("short_name"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    color: text("color"),
    notes: text("notes"),
    // Valores padrão em BRL (centavos) — opcional
    default_hourly_rate_cents: decimal("default_hourly_rate_cents", {
      precision: 14,
      scale: 0,
    }),
    default_shift_pay_cents: decimal("default_shift_pay_cents", {
      precision: 14,
      scale: 0,
    }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userIdx: index("workplaces_user_idx").on(t.user_id),
  })
);

export type Workplace = typeof workplaces.$inferSelect;
export type NewWorkplace = typeof workplaces.$inferInsert;
