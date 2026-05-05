import { sql } from "drizzle-orm";
import {
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  channelEnum,
  idColumn,
  inboxStatusEnum,
  intentEnum,
  timestampsColumns,
  userIdColumn,
} from "./_shared";

/**
 * Inbox polimórfico — toda mensagem recebida (Telegram, Web quick-add, e-mail)
 * vira um InboxItem com `intent` (task | shift | transaction | note) e `payload` JSON parseado.
 *
 * Fluxo:
 *   1. Bot recebe mensagem → cria InboxItem(status=pending, raw_content)
 *   2. Inngest job: parseIntent (LLM) → preenche intent + payload + confidence
 *   3. UI mostra preview ao usuário → user confirma ou edita
 *   4. Confirmação → cria entidade real (Task/Shift/Transaction) + status=confirmed
 *      + persiste resolved_entity_table + resolved_entity_id
 */
export const inboxItems = pgTable(
  "inbox_items",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    channel: channelEnum("channel").notNull(),
    // ID externo da mensagem (telegram message_id, email message-id, etc) — para idempotência
    external_id: text("external_id"),
    raw_content: text("raw_content").notNull(),
    // Intent classificado pelo LLM
    intent: intentEnum("intent").notNull().default("unknown"),
    confidence: decimal("confidence", { precision: 5, scale: 4 }),
    // Payload estruturado pelo parsing (Zod-validated)
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: inboxStatusEnum("status").notNull().default("pending"),
    // Quando confirmado, qual entidade foi criada
    resolved_entity_table: text("resolved_entity_table"),
    resolved_entity_id: uuid("resolved_entity_id"),
    // Erro de parsing (se houver)
    parse_error: text("parse_error"),
    // Quanto custou em tokens (observabilidade de custos LLM)
    llm_input_tokens: decimal("llm_input_tokens", { precision: 10, scale: 0 }),
    llm_output_tokens: decimal("llm_output_tokens", {
      precision: 10,
      scale: 0,
    }),
    llm_model: text("llm_model"),
    received_at: timestamp("received_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("inbox_user_status_idx").on(t.user_id, t.status),
    channelIdx: index("inbox_channel_idx").on(t.channel),
  })
);

export type InboxItem = typeof inboxItems.$inferSelect;
export type NewInboxItem = typeof inboxItems.$inferInsert;
