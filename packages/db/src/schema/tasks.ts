import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { recurrenceRules } from "./recurrence";
import {
  idColumn,
  taskPriorityEnum,
  taskStatusEnum,
  timestampsColumns,
  userIdColumn,
} from "./_shared";
import { workplaces } from "./workplaces";

/**
 * Tarefas — TODO list integrada ao calendário.
 * Podem ser time-blocked (alocadas em janela específica) ou apenas com due_date.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    workplace_id: uuid("workplace_id").references(() => workplaces.id, {
      onDelete: "set null",
    }),
    recurrence_id: uuid("recurrence_id").references(() => recurrenceRules.id, {
      onDelete: "set null",
    }),
    parent_task_id: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    due_at: timestamp("due_at", { withTimezone: true }),
    // Time blocking
    scheduled_start: timestamp("scheduled_start", { withTimezone: true }),
    scheduled_end: timestamp("scheduled_end", { withTimezone: true }),
    estimated_minutes: integer("estimated_minutes"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    // Sync com Google Calendar (quando time-blocked)
    gcal_event_id: text("gcal_event_id"),
    gcal_calendar_id: text("gcal_calendar_id"),
    gcal_etag: text("gcal_etag"),
    locked_attributes: jsonb("locked_attributes")
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("tasks_user_status_idx").on(t.user_id, t.status),
    userDueIdx: index("tasks_user_due_idx").on(t.user_id, t.due_at),
    parentIdx: index("tasks_parent_idx").on(t.parent_task_id),
  })
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
