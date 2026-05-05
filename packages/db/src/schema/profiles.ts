import { sql } from "drizzle-orm";
import { pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import {
  authUsers,
  idColumn,
  timestampsColumns,
} from "./_shared";

/**
 * Perfil do usuário (1:1 com auth.users).
 * Criado automaticamente via trigger quando um auth.users é inserido (ver migration manual).
 */
export const profiles = pgTable("profiles", {
  // PK = auth.users.id (1:1)
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  full_name: text("full_name"),
  display_name: text("display_name"),
  avatar_url: text("avatar_url"),
  timezone: text("timezone").notNull().default("America/Recife"),
  default_currency: text("default_currency").notNull().default("BRL"),
  // Telegram chat_id criptografado / vinculado
  telegram_chat_id: text("telegram_chat_id"),
  telegram_username: text("telegram_username"),
  // Especialidade médica (futuro)
  specialty: text("specialty"),
  crm: text("crm"),
  // Preferências livres (UI, atalhos, etc)
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  ...timestampsColumns(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
