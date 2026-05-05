import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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
import {
  idColumn,
  timestampsColumns,
  transactionTypeEnum,
  userIdColumn,
} from "./_shared";
import { categories, financialAccounts, transactions } from "./financial";

/**
 * Batch de extração de fatura/extrato (1 arquivo = 1 batch).
 * status:
 *   'parsing'    — aguardando Inngest extrair
 *   'review'     — items prontos pra revisão do usuário
 *   'confirmed'  — usuário aceitou; transactions criadas
 *   'discarded'  — usuário descartou
 *   'failed'     — erro de extração
 */
export const inboxBatches = pgTable(
  "inbox_batches",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    // 'web_upload' | 'telegram_image' | 'telegram_document'
    source: text("source").notNull(),
    // Path no Supabase Storage: {user_id}/{batch_id}/source-...
    source_file_url: text("source_file_url"),
    source_file_type: text("source_file_type"),
    source_file_size_bytes: integer("source_file_size_bytes"),
    // SHA-256 hex do arquivo — dedupe por (user_id, source_file_hash)
    source_file_hash: text("source_file_hash"),
    // 'nubank_invoice' | 'itau_extract' | 'bb_invoice' | 'unknown' etc.
    detected_origin: text("detected_origin"),
    statement_period_start: date("statement_period_start"),
    statement_period_end: date("statement_period_end"),
    status: text("status").notNull().default("parsing"),
    // Snapshot bruto da resposta do LLM (pra debug/reprocesso)
    raw_extraction: jsonb("raw_extraction").notNull().default(sql`'{}'::jsonb`),
    error_message: text("error_message"),
    total_count: integer("total_count").notNull().default(0),
    total_amount_cents: decimal("total_amount_cents", {
      precision: 14,
      scale: 0,
    })
      .notNull()
      .default("0"),
    // Conta selecionada pelo usuário ao confirmar (todas as transactions vão pra ela)
    target_account_id: uuid("target_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" }
    ),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("batches_user_status_idx").on(t.user_id, t.status),
    userHashIdx: index("batches_user_hash_idx").on(
      t.user_id,
      t.source_file_hash
    ),
  })
);

/**
 * Item individual de um batch — uma linha da fatura.
 * status: 'pending' | 'confirmed' | 'discarded'
 * Quando confirmed, transaction_id aponta pra transaction criada.
 */
export const inboxBatchItems = pgTable(
  "inbox_batch_items",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    batch_id: uuid("batch_id")
      .notNull()
      .references(() => inboxBatches.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    raw_description: text("raw_description").notNull(),
    description: text("description").notNull(),
    // Sempre POSITIVO em centavos. Sinal vem de `type`.
    amount_cents: decimal("amount_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    occurred_on: date("occurred_on").notNull(),
    suggested_category_id: uuid("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    confidence: decimal("confidence", { precision: 5, scale: 4 }),
    status: text("status").notNull().default("pending"),
    transaction_id: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    is_duplicate: boolean("is_duplicate").notNull().default(false),
    duplicate_of_transaction_id: uuid("duplicate_of_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" }
    ),
    installment_current: integer("installment_current"),
    installment_total: integer("installment_total"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    batchPositionIdx: index("batch_items_batch_position_idx").on(
      t.batch_id,
      t.position
    ),
    userBatchIdx: index("batch_items_user_batch_idx").on(t.user_id, t.batch_id),
  })
);

/**
 * Aliases aprendidos: "AMZN MKTP BR" → "Amazon" + categoria.
 * Aplicado automaticamente no parsing de batches futuros.
 * uniqueIndex em (user_id, pattern) habilita onConflictDoUpdate em upsertAlias.
 */
export const descriptionAliases = pgTable(
  "description_aliases",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    pattern: text("pattern").notNull(),
    // 'exact' | 'starts_with' | 'contains'
    match_type: text("match_type").notNull().default("contains"),
    canonical_name: text("canonical_name").notNull(),
    suggested_category_id: uuid("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    usage_count: integer("usage_count").notNull().default(0),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userPatternUnique: uniqueIndex("aliases_user_pattern_unique").on(
      t.user_id,
      t.pattern
    ),
  })
);

export type InboxBatch = typeof inboxBatches.$inferSelect;
export type NewInboxBatch = typeof inboxBatches.$inferInsert;
export type InboxBatchItem = typeof inboxBatchItems.$inferSelect;
export type NewInboxBatchItem = typeof inboxBatchItems.$inferInsert;
export type DescriptionAlias = typeof descriptionAliases.$inferSelect;
export type NewDescriptionAlias = typeof descriptionAliases.$inferInsert;
