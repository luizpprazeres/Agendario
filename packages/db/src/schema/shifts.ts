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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recurrenceRules } from "./recurrence";
import {
  idColumn,
  shiftStatusEnum,
  timestampsColumns,
  userIdColumn,
} from "./_shared";
import { workplaces } from "./workplaces";

/**
 * Templates de plantão — definem padrões recorrentes (ex: "Plantão Albert Einstein 19h-7h sáb").
 * Geram instâncias `shifts` via job recorrente.
 */
export const shiftTemplates = pgTable(
  "shift_templates",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    workplace_id: uuid("workplace_id")
      .notNull()
      .references(() => workplaces.id, { onDelete: "cascade" }),
    recurrence_id: uuid("recurrence_id").references(() => recurrenceRules.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    // Hora de início "HH:mm" e duração em minutos
    start_time_local: text("start_time_local").notNull(),
    duration_minutes: integer("duration_minutes").notNull(),
    pay_cents: decimal("pay_cents", { precision: 14, scale: 0 }),
    notes: text("notes"),
    is_active: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userIdx: index("shift_templates_user_idx").on(t.user_id),
  })
);

/**
 * Instâncias concretas de plantão.
 * Podem ser geradas a partir de template OU criadas avulsas.
 */
export const shifts = pgTable(
  "shifts",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    workplace_id: uuid("workplace_id")
      .notNull()
      .references(() => workplaces.id, { onDelete: "cascade" }),
    template_id: uuid("template_id").references(() => shiftTemplates.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: shiftStatusEnum("status").notNull().default("scheduled"),
    pay_cents: decimal("pay_cents", { precision: 14, scale: 0 }),
    notes: text("notes"),
    // Sync com Google Calendar
    gcal_event_id: text("gcal_event_id"),
    gcal_calendar_id: text("gcal_calendar_id"),
    gcal_etag: text("gcal_etag"),
    // Atributos travados pelo usuário (não sobrescrever em sync)
    locked_attributes: jsonb("locked_attributes")
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userTimeIdx: index("shifts_user_time_idx").on(t.user_id, t.starts_at),
    workplaceIdx: index("shifts_workplace_idx").on(t.workplace_id),
    gcalUnique: uniqueIndex("shifts_gcal_event_unique").on(
      t.user_id,
      t.gcal_event_id
    ),
  })
);

export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type NewShiftTemplate = typeof shiftTemplates.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
