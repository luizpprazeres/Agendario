import { sql } from "drizzle-orm";
import { date, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import {
  idColumn,
  recurrenceFreqEnum,
  timestampsColumns,
  userIdColumn,
} from "./_shared";

/**
 * Regras de recorrência — usadas tanto por shift_templates quanto por tasks.
 * Suporta padrões simples (DAILY/WEEKLY/MONTHLY) e RRULE customizada.
 */
export const recurrenceRules = pgTable("recurrence_rules", {
  id: idColumn(),
  user_id: userIdColumn(),
  freq: recurrenceFreqEnum("freq").notNull(),
  interval: integer("interval").notNull().default(1),
  // Para WEEKLY: 0..6 = sun..sat, JSON array
  byweekday: jsonb("byweekday").default(sql`'[]'::jsonb`),
  // Para MONTHLY: 1..31, JSON array
  bymonthday: jsonb("bymonthday").default(sql`'[]'::jsonb`),
  count: integer("count"),
  until: date("until"),
  // Para freq=custom_rrule: string RFC 5545 completa
  rrule: text("rrule"),
  ...timestampsColumns(),
});

export type RecurrenceRule = typeof recurrenceRules.$inferSelect;
export type NewRecurrenceRule = typeof recurrenceRules.$inferInsert;
