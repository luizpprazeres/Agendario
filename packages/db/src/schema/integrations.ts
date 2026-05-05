import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  idColumn,
  timestampsColumns,
  userIdColumn,
} from "./_shared";

/**
 * Tokens OAuth Google Calendar.
 * access_token e refresh_token devem ser criptografados em produção.
 */
export const googleCalendarTokens = pgTable(
  "google_calendar_tokens",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    // Email da conta Google conectada (suporta múltiplas no futuro)
    google_email: text("google_email").notNull(),
    access_token: text("access_token").notNull(),
    refresh_token: text("refresh_token").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    scope: text("scope").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    ...timestampsColumns(),
  },
  (t) => ({
    userEmailIdx: index("gcal_tokens_user_email_idx").on(
      t.user_id,
      t.google_email
    ),
  })
);

/**
 * Calendários do usuário no Google (cache).
 * Usuário escolhe quais calendars sincronizar (estilo Calendar Sets do Morgen).
 */
export const googleCalendars = pgTable(
  "google_calendars",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    google_email: text("google_email").notNull(),
    calendar_id: text("calendar_id").notNull(),
    summary: text("summary").notNull(),
    timezone: text("timezone"),
    color: text("color"),
    primary: boolean("primary").notNull().default(false),
    sync_enabled: boolean("sync_enabled").notNull().default(true),
    // Direção: 'pull' | 'push' | 'both'
    sync_direction: text("sync_direction").notNull().default("both"),
    // Token de sync incremental (Google Calendar)
    sync_token: text("sync_token"),
    ...timestampsColumns(),
  },
  (t) => ({
    userCalUnique: index("gcal_calendars_user_cal_idx").on(
      t.user_id,
      t.calendar_id
    ),
  })
);

/**
 * Watch channels — registro dos webhooks ativos do Google.
 * Precisam ser renovados a cada ~7 dias (cron job).
 */
export const googleCalendarWatches = pgTable("google_calendar_watches", {
  id: idColumn(),
  user_id: userIdColumn(),
  calendar_id: text("calendar_id").notNull(),
  channel_id: text("channel_id").notNull(),
  resource_id: text("resource_id").notNull(),
  expiration: timestamp("expiration", { withTimezone: true }).notNull(),
  ...timestampsColumns(),
});

/**
 * Mapeamento de chat_id Telegram → user_id Agendario.
 * Vinculação via comando /start <token> ou compartilhamento de número.
 */
export const telegramUsers = pgTable(
  "telegram_users",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    telegram_chat_id: text("telegram_chat_id").notNull().unique(),
    telegram_user_id: text("telegram_user_id"),
    telegram_username: text("telegram_username"),
    is_active: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userIdx: index("telegram_users_user_idx").on(t.user_id),
  })
);

/**
 * Imports — registro de cada import CSV/OFX para auditoria + dedup.
 */
export const imports = pgTable("imports", {
  id: idColumn(),
  user_id: userIdColumn(),
  account_id: text("account_id"),
  format: text("format").notNull(),
  filename: text("filename").notNull(),
  file_hash: text("file_hash").notNull(),
  status: text("status").notNull().default("pending"),
  total_rows: text("total_rows"),
  imported_count: text("imported_count"),
  duplicate_count: text("duplicate_count"),
  error_count: text("error_count"),
  errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
  ...timestampsColumns(),
});

export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;
export type GoogleCalendar = typeof googleCalendars.$inferSelect;
export type GoogleCalendarWatch = typeof googleCalendarWatches.$inferSelect;
export type TelegramUser = typeof telegramUsers.$inferSelect;
export type ImportRecord = typeof imports.$inferSelect;
