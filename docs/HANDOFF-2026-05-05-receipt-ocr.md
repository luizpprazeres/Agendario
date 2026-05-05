# Handoff: Receipt/Invoice OCR (leitura automática de faturas via imagem/PDF)

**Data:** 2026-05-05
**Status:** aguardando início — feature complexa, dividir em sub-PRs se necessário
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Permitir que o Luiz envie **prints ou PDFs de faturas de cartão / extratos bancários** e o Agendario **extraia automaticamente** as transações, **classifique**, **renomeie descrições crípticas** ("AMZN MKTP BR" → "Amazon"), e crie tudo em batch após aprovação rápida.

**Cenário típico:** chega a fatura do Nubank no email no fim do mês. Luiz tira print ou baixa o PDF, manda no Telegram bot ou faz upload na web. 30 segundos depois tem a lista de 30+ transações organizadas, categorizadas, prontas pra confirmar.

**Modelo de IA:** `gpt-4.1-mini` com vision (já confirmado pelo usuário). API key disponível via `OPENAI_API_KEY`.

**Por que importa:** sem isso, lançar a fatura mensal manualmente leva 1h+ de trabalho repetitivo. Com isso, vira 2-3 minutos de revisão. É a feature de mais alavancagem do app pra reduzir fricção financeira.

---

## 2. Decisões arquiteturais (lê com calma — várias coisas dependem disso)

### 2.1. Por que tabela nova (`inbox_batches`) e não reusar `inbox_items`?

`inbox_items` é 1-to-1 com input (1 mensagem do Telegram = 1 item). Receipt produz N transações de 1 input — semântica diferente. Criar `inbox_batches` (1 fatura = 1 batch) + `inbox_batch_items` (N linhas) preserva o conceito.

### 2.2. Por que NÃO criar transactions imediatamente após extrair?

Extração via LLM é boa mas não infalível:
- Pode confundir saldo anterior com transação
- Pode errar centavos
- Pode duplicar
- Categoria sugerida pode estar errada

**Sempre revisar antes** de virar transactions. A UI de batch review é o ponto de revisão.

### 2.3. Por que `gpt-4.1-mini` (vision) e não OCR clássico (Tesseract, etc)?

OCR puro retorna texto cru — depois precisaria parser regex frágil pra cada banco. LLM com vision **entende** o documento: separa header de itens, identifica colunas, infere ano se faltar, detecta parcelamento "8/12", reconhece moeda. Custo: ~$0.01/imagem. Vale demais.

### 2.4. Por que aprender renomeações automaticamente?

User editou "AMZN MKTP BR" pra "Amazon" uma vez. Próxima fatura vai ter dezenas de "AMZN MKTP BR". Salvar a regra (`description_aliases`) e aplicar automaticamente. Aprendizagem implícita >> configuração explícita.

### 2.5. Storage: Supabase Storage. Por quê?

- Já temos Supabase
- RLS bucket-level via JWT
- URLs assinadas pra leitura temporária no LLM
- Lifecycle rules pra limpar arquivos antigos

### 2.6. Web first, Telegram depois?

**SIM.** Telegram tem limites (10MB pra foto, 20MB pra documento) e UX limitada (scroll de 30 linhas no chat ruim). Web é onde a revisão **deve** acontecer. Telegram pode ser shortcut de upload mas o link "abre na web pra revisar" é melhor.

**MVP escopo:** apenas web upload. Telegram fica pra fase 1.5.

### 2.7. PDF: extrair texto direto ou converter pra imagem?

Decisão: **converter pra imagem** (1 imagem por página, max 5 páginas) e enviar ao vision API. Razões:
- LLM com vision lida bem com PDFs visuais
- Bibliotecas de extração de texto de PDF brasileiro são frágeis
- Latência aceitável (~5-10s por página)

Lib: `pdf-to-img` ou `pdfjs-dist` no server. Avaliar quando codar.

---

## 3. Componentes técnicos (visão geral antes do passo-a-passo)

```
[Web upload]                  [Telegram photo/doc]    (← fase 1.5)
      │                              │
      ▼                              ▼
  POST /api/receipts/upload     bot.on(photo/document)
      │                              │
      └──────────┬───────────────────┘
                 │
                 ▼
       Supabase Storage
       (receipts bucket)
                 │
                 ▼
   INSERT inbox_batches (status='parsing', source_file_url)
                 │
                 ▼
       inngest.send("receipts/extract-requested")
                 │
                 ▼
   Inngest fn: extract-receipt
       → load file from Storage
       → if PDF: convert pages to images
       → for each image: gpt-4.1-mini vision call
       → aggregate raw extraction
       → for each line: apply description_aliases
       → INSERT inbox_batch_items (with suggested_category_id)
       → UPDATE batch status='review'
       → notify user (Telegram message OR just URL)
                 │
                 ▼
   User opens /importar/{batch_id}
       → review checkbox per line
       → edit description (saves alias)
       → reclassify (saves alias category mapping)
       → bulk actions
                 │
                 ▼
   Server action: confirmBatch(batchId, edits)
       → BEGIN transaction
       → for each kept item: INSERT transaction
       → if user edited alias: INSERT/UPDATE description_aliases
       → UPDATE batch status='confirmed'
       → COMMIT
       → revalidatePath
                 │
                 ▼
       /dashboard mostra novas transactions
```

---

## 4. Próximos passos (ordem)

### 4.1. Pré-requisitos

```bash
git pull origin main
cat packages/db/src/schema/inbox.ts  # ler shape atual de inbox_items
ls apps/web/src/lib/openai/  # ver clients existentes
```

### 4.2. Schema novo: `inbox_batches`, `inbox_batch_items`, `description_aliases`

Criar `packages/db/src/schema/receipts.ts`:

```ts
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
import { categories, financialAccounts, transactions } from "./financial";

/**
 * Batch de extração de fatura/extrato.
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
    source: text("source").notNull(), // 'web_upload' | 'telegram_image' | 'telegram_document'
    source_file_url: text("source_file_url"),
    source_file_type: text("source_file_type"), // 'image/png' | 'application/pdf' etc
    source_file_size_bytes: integer("source_file_size_bytes"),
    source_file_hash: text("source_file_hash"), // SHA-256 do arquivo (dedupe)
    detected_origin: text("detected_origin"), // 'nubank_invoice' | 'itau_extract' | 'unknown'
    statement_period_start: date("statement_period_start"),
    statement_period_end: date("statement_period_end"),
    status: text("status").notNull().default("parsing"),
    raw_extraction: jsonb("raw_extraction").notNull().default(sql`'{}'::jsonb`),
    error_message: text("error_message"),
    total_count: integer("total_count").notNull().default(0),
    total_amount_cents: decimal("total_amount_cents", {
      precision: 14,
      scale: 0,
    }).notNull().default("0"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    confirmed_at: text("confirmed_at"),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("batches_user_status_idx").on(t.user_id, t.status),
    userHashIdx: index("batches_user_hash_idx").on(t.user_id, t.source_file_hash),
  })
);

/**
 * Item individual de um batch — uma linha da fatura.
 * status: 'pending' | 'confirmed' | 'discarded' | 'modified'
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
    amount_cents: decimal("amount_cents", { precision: 14, scale: 0 }).notNull(),
    type: text("type").notNull(), // 'income' | 'expense' | 'transfer'
    occurred_on: date("occurred_on").notNull(),
    suggested_category_id: uuid("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    suggested_account_id: uuid("suggested_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" }
    ),
    confidence: decimal("confidence", { precision: 5, scale: 4 }),
    status: text("status").notNull().default("pending"),
    transaction_id: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    is_duplicate: integer("is_duplicate").notNull().default(0), // 0 | 1
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
 * Aplicado automaticamente no parsing de batches futuros e em transactions
 * vindas do Telegram (parse-intent pode usar isso depois).
 */
export const descriptionAliases = pgTable(
  "description_aliases",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    pattern: text("pattern").notNull(), // texto que dispara o match
    match_type: text("match_type").notNull().default("contains"), // 'exact' | 'starts_with' | 'contains'
    canonical_name: text("canonical_name").notNull(),
    suggested_category_id: uuid("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    usage_count: integer("usage_count").notNull().default(0),
    last_used_at: text("last_used_at"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userPatternIdx: index("aliases_user_pattern_idx").on(t.user_id, t.pattern),
  })
);

export type InboxBatch = typeof inboxBatches.$inferSelect;
export type NewInboxBatch = typeof inboxBatches.$inferInsert;
export type InboxBatchItem = typeof inboxBatchItems.$inferSelect;
export type NewInboxBatchItem = typeof inboxBatchItems.$inferInsert;
export type DescriptionAlias = typeof descriptionAliases.$inferSelect;
export type NewDescriptionAlias = typeof descriptionAliases.$inferInsert;
```

Adicionar export em `packages/db/src/schema/index.ts`:
```ts
export * from "./receipts";
```

### 4.3. Migration

```bash
pnpm db:generate
pnpm db:migrate
```

### 4.4. RLS policies

Criar `packages/db/sql/0005_receipts_rls.sql`:
```sql
ALTER TABLE inbox_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_batches_owner_all"
  ON inbox_batches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE inbox_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_batch_items_owner_all"
  ON inbox_batch_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE description_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "description_aliases_owner_all"
  ON description_aliases FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

```bash
psql "$DATABASE_URL" -f packages/db/sql/0005_receipts_rls.sql
```

### 4.5. Supabase Storage bucket

**Antes do código:** o usuário precisa criar o bucket `receipts` no Supabase Dashboard:
- Storage → Create bucket
- Name: `receipts`
- Public: **NO** (private)
- File size limit: 25 MB
- Allowed MIME types: `image/png, image/jpeg, image/webp, application/pdf`

E aplicar policies:
```sql
-- packages/db/sql/0005_receipts_rls.sql (append):

-- Storage: usuário só acessa próprios arquivos
CREATE POLICY "users_read_own_receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_insert_own_receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users_delete_own_receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Path convention: `{user_id}/{batch_id}/{filename}`.

### 4.6. Env var pra modelo de vision

Adicionar em `apps/web/src/env.ts` (server schema):
```ts
OPENAI_MODEL_VISION: z.string().default("gpt-4.1-mini"),
```

E em `.env.example`:
```
OPENAI_MODEL_VISION=gpt-4.1-mini
```

### 4.7. Dependência: PDF → imagem

```bash
pnpm --filter @agendario/web add pdf-to-img
```

(Avaliar alternativas se pdf-to-img tiver problemas: `@napi-rs/canvas + pdfjs-dist` é mais robusto mas mais pesado.)

### 4.8. Helper: extract via OpenAI

Criar `apps/web/src/lib/openai/extract-receipt.ts`:

```ts
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./client";
import { serverEnv } from "@/env";

const ExtractedItem = z.object({
  raw_description: z.string().describe("Texto exato como aparece na fatura"),
  description: z.string().describe("Descrição limpa, com primeira letra maiúscula"),
  amount_brl: z.number().describe("Valor em reais com sinal: + crédito/income, - débito/expense"),
  occurred_on: z.string().describe("Data YYYY-MM-DD; infira o ano se faltar"),
  installment_current: z.number().nullable().describe("Se '3/12' aparecer, retorne 3"),
  installment_total: z.number().nullable().describe("Se '3/12' aparecer, retorne 12"),
  reference_card_lastfour: z.string().nullable().describe("Últimos 4 dígitos do cartão se referenciado"),
  reference_pix_key: z.string().nullable().describe("Chave Pix se for transferência"),
});

const Extraction = z.object({
  detected_origin: z.string().describe(
    "Banco/cartão de origem inferido: 'nubank_invoice', 'itau_extract', 'bb_invoice', 'caixa', 'inter', 'c6', 'santander', 'unknown'"
  ),
  statement_type: z.enum([
    "credit_card_invoice",
    "bank_statement",
    "single_receipt",
    "unknown",
  ]),
  statement_period_start: z.string().nullable(),
  statement_period_end: z.string().nullable(),
  total_amount_brl: z.number().nullable().describe("Total da fatura, se mostrado"),
  items: z.array(ExtractedItem),
  notes: z.string().nullable().describe("Qualquer observação relevante (qualidade da imagem, ambiguidades)"),
});

export type ReceiptExtraction = z.infer<typeof Extraction>;

const SYSTEM = `Você processa faturas de cartão e extratos bancários BRASILEIROS em português.

REGRAS DE EXTRAÇÃO:
- Inclua APENAS linhas de transação real
- IGNORE: saldo anterior, saldo atual, totais, subtotais, cabeçalhos de seção, datas isoladas, vencimentos
- Sinal: crédito/income é POSITIVO, débito/expense é NEGATIVO
- Datas: formato YYYY-MM-DD. Se a fatura mostra "12/05" sem ano, infira pelo período da fatura
- Parcelamento: detecte padrão "X/Y" em descrições (ex: "MACBOOK 3/12") e preencha installment_current/total
- Limpe descrições removendo prefixos genéricos ("PAYPAL *", "EBANX *") sem perder o vendor real
- Mantenha raw_description com texto EXATO da fonte
- Se a imagem estiver borrada ou ilegível em parte, retorne só o que tiver certeza e mencione em notes

NUNCA invente transações que não estão visíveis. Prefira retornar menos itens com alta confiança.`;

export async function extractReceipt(
  imageUrls: string[]  // URLs públicas/assinadas
): Promise<ReceiptExtraction> {
  const client = getOpenAI();
  const model = serverEnv.OPENAI_MODEL_VISION;

  const content = [
    { type: "text" as const, text: "Extraia transações desta(s) imagem(ns)." },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const completion = await client.beta.chat.completions.parse({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    response_format: zodResponseFormat(Extraction, "receipt_extraction"),
    temperature: 0.1,
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("Failed to parse receipt extraction");
  return parsed;
}
```

### 4.9. Helper: PDF → array de URLs de imagens

Criar `apps/web/src/lib/storage/pdf-to-images.ts`:
- Recebe `Buffer` ou URL do PDF
- Converte cada página em PNG
- Faz upload de cada PNG no Storage com path `{user_id}/{batch_id}/page-{N}.png`
- Retorna array de signed URLs

Usar `pdf-to-img` (verificar API). Se não funcionar bem, fallback pra processar 1 página inteira como imagem única (passar PDF direto pro vision API testando se aceita).

**MVP:** limitar a 5 páginas. Se o PDF tem mais, processar só as 5 primeiras e adicionar warning em `notes`.

### 4.10. Helper: aplicar aliases

Criar `apps/web/src/lib/aliases.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { descriptionAliases } from "@agendario/db";

export type AliasMatch = {
  canonical_name: string;
  suggested_category_id: string | null;
};

export async function loadUserAliases(userId: string) {
  const db = getDb();
  return await db
    .select()
    .from(descriptionAliases)
    .where(eq(descriptionAliases.user_id, userId));
}

export function applyAliases(
  rawDescription: string,
  aliases: { pattern: string; match_type: string; canonical_name: string; suggested_category_id: string | null }[]
): AliasMatch | null {
  const normalized = rawDescription.toLowerCase().trim();
  for (const a of aliases) {
    const p = a.pattern.toLowerCase();
    const matches =
      a.match_type === "exact"
        ? normalized === p
        : a.match_type === "starts_with"
          ? normalized.startsWith(p)
          : normalized.includes(p);
    if (matches) {
      return {
        canonical_name: a.canonical_name,
        suggested_category_id: a.suggested_category_id,
      };
    }
  }
  return null;
}

export async function upsertAlias(
  userId: string,
  pattern: string,
  canonical_name: string,
  suggested_category_id: string | null
) {
  const db = getDb();
  // Simple "contains" match by default. Future: detect best match_type.
  await db
    .insert(descriptionAliases)
    .values({
      user_id: userId,
      pattern,
      match_type: "contains",
      canonical_name,
      suggested_category_id,
      usage_count: 1,
    })
    .onConflictDoUpdate({
      target: [descriptionAliases.user_id, descriptionAliases.pattern],
      set: {
        canonical_name,
        suggested_category_id,
        usage_count: sql`${descriptionAliases.usage_count} + 1`,
        last_used_at: new Date().toISOString(),
      },
    });
}
```

(Schema pode precisar de uniqueIndex em `(user_id, pattern)` pra `onConflictDoUpdate` funcionar — adicionar.)

### 4.11. Inngest function: extract-receipt

Criar `apps/web/src/lib/inngest/functions/extract-receipt.ts`:

```ts
import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { inboxBatches, inboxBatchItems, transactions } from "@agendario/db";
import { extractReceipt } from "@/lib/openai/extract-receipt";
import { loadUserAliases, applyAliases } from "@/lib/aliases";

export const extractReceiptFn = inngest.createFunction(
  { id: "extract-receipt", retries: 2 },
  { event: "receipts/extract-requested" },
  async ({ event, step, logger }) => {
    const { batch_id } = event.data as { batch_id: string };

    const batch = await step.run("load-batch", async () => {
      const db = getDb();
      const [b] = await db
        .select()
        .from(inboxBatches)
        .where(eq(inboxBatches.id, batch_id))
        .limit(1);
      return b ?? null;
    });

    if (!batch) {
      logger.warn("Batch not found", { batch_id });
      return { skipped: "batch_not_found" };
    }

    if (batch.status !== "parsing") {
      logger.info("Batch already processed", { status: batch.status });
      return { skipped: "already_processed" };
    }

    // 1. Resolver lista de imagens (PDF → split em páginas se necessário)
    const imageUrls = await step.run("prepare-images", async () => {
      // Implementar:
      // - Se source_file_type começa com 'image/', signed URL direto
      // - Se 'application/pdf', converter pra PNGs e fazer upload
      // - Limit 5 imagens
      return await prepareImagesForVision(batch);
    });

    // 2. Chamar LLM
    const extraction = await step.run("extract", async () => {
      return await extractReceipt(imageUrls);
    });

    // 3. Carregar aliases pro usuário
    const aliases = await step.run("load-aliases", async () => {
      return await loadUserAliases(batch.user_id);
    });

    // 4. Detectar duplicatas (compare com transactions existentes)
    const existing = await step.run("load-existing-tx", async () => {
      const db = getDb();
      // Carrega últimas 200 transactions do user pra comparar
      return await db
        .select({
          id: transactions.id,
          description: transactions.description,
          amount_cents: transactions.amount_cents,
          occurred_on: transactions.occurred_on,
        })
        .from(transactions)
        .where(eq(transactions.user_id, batch.user_id))
        .orderBy(desc(transactions.created_at))
        .limit(200);
    });

    function findDuplicate(desc: string, amountCents: number, occurredOn: string) {
      return existing.find(
        (t) =>
          Math.abs(Number(t.amount_cents) - amountCents) < 1 &&
          t.occurred_on === occurredOn &&
          t.description.toLowerCase().includes(desc.slice(0, 12).toLowerCase())
      );
    }

    // 5. Persistir items
    await step.run("save-items", async () => {
      const db = getDb();
      const items = extraction.items.map((it, idx) => {
        const aliasMatch = applyAliases(it.raw_description, aliases);
        const finalDescription = aliasMatch?.canonical_name ?? it.description;
        const amountCents = Math.round(it.amount_brl * 100);
        const dup = findDuplicate(finalDescription, amountCents, it.occurred_on);

        return {
          user_id: batch.user_id,
          batch_id: batch.id,
          position: idx,
          raw_description: it.raw_description,
          description: finalDescription,
          amount_cents: amountCents.toString(),
          type: it.amount_brl >= 0 ? "income" : "expense",
          occurred_on: it.occurred_on,
          suggested_category_id: aliasMatch?.suggested_category_id ?? null,
          installment_current: it.installment_current,
          installment_total: it.installment_total,
          is_duplicate: dup ? 1 : 0,
          duplicate_of_transaction_id: dup?.id ?? null,
          status: "pending",
        };
      });

      if (items.length > 0) {
        await db.insert(inboxBatchItems).values(items);
      }
    });

    // 6. Atualizar batch
    await step.run("finalize-batch", async () => {
      const db = getDb();
      await db
        .update(inboxBatches)
        .set({
          status: "review",
          detected_origin: extraction.detected_origin,
          statement_period_start: extraction.statement_period_start,
          statement_period_end: extraction.statement_period_end,
          total_count: extraction.items.length,
          total_amount_cents: Math.round(
            extraction.items.reduce((s, i) => s + i.amount_brl, 0) * 100
          ).toString(),
          raw_extraction: extraction as never,
        })
        .where(eq(inboxBatches.id, batch.id));
    });

    // 7. Disparar categorização Inngest pra cada item (reusa pipeline existente)
    //    OU fazer em bulk via prompt LLM aqui mesmo. Pra MVP: skipar — categoria
    //    sugerida vem do alias OU usuário escolhe na review.
    //    Fase 2: enriquecer com call ao categorize-transaction.

    return { ok: true, item_count: extraction.items.length };
  }
);

async function prepareImagesForVision(batch: { /* ... */ }): Promise<string[]> {
  // Implementação dependendo do source_file_type
  // TODO: ver passo 4.9
  throw new Error("not implemented");
}
```

Registrar em `index.ts`.

### 4.12. API route: upload + iniciar batch

Criar `apps/web/src/app/api/receipts/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { inboxBatches } from "@agendario/db";
import { inngest } from "@/lib/inngest/client";
import { createHash } from "node:crypto";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");

  const db = getDb();

  // Detectar duplicate por hash
  const [existing] = await db
    .select({ id: inboxBatches.id, status: inboxBatches.status })
    .from(inboxBatches)
    .where(
      and(
        eq(inboxBatches.user_id, user.id),
        eq(inboxBatches.source_file_hash, hash)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      duplicate: true,
      batch_id: existing.id,
      status: existing.status,
    });
  }

  // Cria batch
  const [batch] = await db
    .insert(inboxBatches)
    .values({
      user_id: user.id,
      source: "web_upload",
      source_file_type: file.type,
      source_file_size_bytes: file.size,
      source_file_hash: hash,
      status: "parsing",
    })
    .returning({ id: inboxBatches.id });

  if (!batch) {
    return NextResponse.json({ error: "create_batch_failed" }, { status: 500 });
  }

  // Upload pro Storage
  const path = `${user.id}/${batch.id}/source-${Date.now()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from("receipts")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await db.update(inboxBatches)
      .set({ status: "failed", error_message: uploadErr.message })
      .where(eq(inboxBatches.id, batch.id));
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  await db
    .update(inboxBatches)
    .set({ source_file_url: path })
    .where(eq(inboxBatches.id, batch.id));

  // Dispara Inngest
  await inngest.send({
    name: "receipts/extract-requested",
    data: { batch_id: batch.id },
  });

  return NextResponse.json({ batch_id: batch.id });
}
```

### 4.13. Páginas web `/importar`

#### `/importar/page.tsx` — lista de batches

Server component. Lista últimos 20 batches do usuário com status badge:
- `parsing` → spinner amber
- `review` → badge azul "X transações"
- `confirmed` → check verde
- `failed` → badge vermelho

Botão grande "Importar fatura" que abre `<UploadModal />`.

#### `/importar/[batch_id]/page.tsx` — review

Server component carrega batch + items. Renderiza componente client `<BatchReview />`.

#### `<BatchReview />` (client component)

Estado local: items (com `kept`, `description`, `category_id` editáveis).

Layout:
```
┌────────────────────────────────────────────────┐
│ ← voltar       Nubank · Maio 2026               │
│                32 transações · R$ 4.892        │
├────────────────────────────────────────────────┤
│ [✓ Marcar todos] [Desmarcar] [Por data ▾]      │
├────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐│
│ │ ☑  02 mai · Restaurante Micale               ││
│ │    Restaurantes ▾              R$ 150,00     ││
│ ├──────────────────────────────────────────────┤│
│ │ ☑  03 mai · Posto Shell                      ││
│ │    Combustível ▾               R$ 312,00     ││
│ ├──────────────────────────────────────────────┤│
│ │ ⚠  04 mai · DUPLICATA?                       ││
│ │    Spotify Family · já existe   R$ 35,00     ││
│ ├──────────────────────────────────────────────┤│
│ │ ☑  05 mai · AMZN MKTP BR                  [↻]││
│ │    [editar descrição: Amazon                ]││
│ │    Compras online ▾            R$ 89,90     ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ Cancelar batch          [Confirmar 28 itens]    │
└────────────────────────────────────────────────┘
```

**Comportamento:**
- Linha duplicada começa **desmarcada** com badge amber "duplicata?" — usuário pode marcar de volta se quiser
- Editar descrição inline: ao salvar, criar/atualizar `description_alias` automaticamente
- Reclassificar categoria: select com lista de categorias do user; ao mudar, **se também editou descrição**, salvar alias com `suggested_category_id`
- Toggle de view: por data (default) | por categoria (group by) | por valor (descending)
- Bulk: "Marcar todos com categoria X" (futuro)

#### Server action `confirmBatch`

```ts
async function confirmBatch(formData: FormData) {
  "use server";
  // ...
  // 1. Validar user
  // 2. Carregar batch + items
  // 3. Filtrar items kept=true e status='pending'
  // 4. INSERT bulk em transactions com (user_id, account_id, category_id, type, amount_cents, description, occurred_on, source='receipt')
  //    UPDATE batch_items.transaction_id e status='confirmed'
  // 5. Para cada edição de descrição/categoria, upsert alias
  // 6. UPDATE batch.status='confirmed', confirmed_at=now()
  // 7. revalidatePath('/dashboard')
  // 8. revalidatePath('/importar')
  // 9. redirect('/dashboard')
}
```

**Atenção:** `account_id` precisa ser definido. Se for fatura de cartão, todas as transactions vão pra mesma conta (cartão). Detectar via `detected_origin` ou pedir ao usuário no topo da review ("Esta fatura é da conta: [Nubank ▾]").

### 4.14. Botão "Importar" no /dashboard

No dashboard, próximo ao Quick Add (após ele estar mergeado), adicionar botão pequeno:
```
[+ Importar fatura]
```

Link `<Link href="/importar">`. Estilo Native ghost button.

### 4.15. Validar end-to-end

1. `pnpm dev:web` + `pnpm dev:inngest`
2. Acessar `/importar`
3. Upload de print de fatura real (pegar uma do Luiz)
4. Aguardar parsing (5-30s)
5. Conferir items extraídos, fazer 2-3 edições (renomear + reclassificar)
6. Confirmar
7. Conferir transactions criadas no `/dashboard`
8. Re-upload da MESMA fatura → deve detectar duplicate hash e redirecionar pro batch existente
9. Importar fatura nova com vendor já aliasado → deve aplicar canonical_name automaticamente

### 4.16. Commit + push como @devops

Por causa do tamanho, considere **quebrar em 2-3 commits**:
1. `feat: schema for receipts batches and description aliases`
2. `feat: receipt extraction via OpenAI vision (gpt-4.1-mini)`
3. `feat: receipt batch review UI in /importar`

Ou um commit gordo se preferir simplicidade.

---

## 5. Perguntas em aberto

1. **PDF rendering server-side**: `pdf-to-img` usa Canvas — pode falhar em Vercel/serverless por falta de libs nativas. **Plano B:** rodar conversão via Inngest function num runtime que aceite (Node native), OU usar API externa (Cloudconvert), OU pular PDF no MVP (só imagens). Sugestão: testar `pdf-to-img` localmente, se falhar em prod, usar plano B.
2. **Token cost / rate limit**: gpt-4.1-mini com vision tem limite de imagens por request (10? 20?). Se fatura tem > 5 páginas, dividir em múltiplas calls e merge. **MVP**: limit 5 páginas, mensagem clara se mais.
3. **Account inference**: `detected_origin='nubank_invoice'` deveria mapear automaticamente pra account "Nubank" do usuário. **MVP**: usuário escolhe manualmente no topo da review. Fase 2: matching automático por nome.
4. **Múltiplos cartões na mesma fatura?** Improvável em fatura única, mas possível em "extrato consolidado". **MVP**: tratar como 1 conta. Edge case raro.
5. **Confirmação parcial**: usuário pode descartar batch inteiro ou confirmar com items selecionados? **Sim** — confirmar só os marcados, batch fica "confirmed" mesmo com alguns descartados.
6. **Auto-confirm com alta confiança?** Se LLM retorna confidence > 0.95 em todos os items, pular review? **NÃO no MVP** — sempre pedir review. Confiança pra automatizar 100% leva meses.
7. **Telegram upload?** Pra fase 1.5: bot recebe foto/document, faz upload pro mesmo bucket via `getServerSideFile()` da grammY, cria batch, manda mensagem com link "abrir review na web".
8. **Aprendizagem cross-batch**: alias aprendido em fatura 1 deve aplicar em fatura 2 do mesmo user — sim, automático via `loadUserAliases` no parse.
9. **Custo total?** ~$0.01 por imagem + tokens. Fatura típica = 1-3 imagens = ~$0.03/fatura. Aceitável.

---

## 6. Artefatos relevantes

### Arquivos a criar
- `packages/db/src/schema/receipts.ts`
- `packages/db/sql/0005_receipts_rls.sql` (inclui storage policies)
- `apps/web/src/lib/openai/extract-receipt.ts`
- `apps/web/src/lib/storage/pdf-to-images.ts`
- `apps/web/src/lib/aliases.ts`
- `apps/web/src/lib/inngest/functions/extract-receipt.ts`
- `apps/web/src/app/api/receipts/upload/route.ts`
- `apps/web/src/app/importar/page.tsx`
- `apps/web/src/app/importar/[batch_id]/page.tsx`
- `apps/web/src/components/batch-review.tsx` (client)
- `apps/web/src/components/upload-modal.tsx` (client)

### Arquivos a editar
- `packages/db/src/schema/index.ts`
- `apps/web/src/env.ts` — `OPENAI_MODEL_VISION`
- `apps/web/package.json` — `pdf-to-img`
- `apps/web/src/lib/inngest/functions/index.ts`
- `apps/web/src/app/dashboard/page.tsx` — botão "Importar fatura"

### Setup externo necessário
- Supabase Dashboard → Storage → criar bucket `receipts` (private, 25MB max, MIME whitelist)
- Aplicar storage policies via SQL (incluído em `0005_receipts_rls.sql`)
- `.env.local`: `OPENAI_MODEL_VISION=gpt-4.1-mini` (já tem `OPENAI_API_KEY`)

### Comandos úteis
```bash
pnpm --filter @agendario/web add pdf-to-img
pnpm db:generate && pnpm db:migrate
pnpm dev:web
pnpm dev:inngest

# Testar extração isolada (script)
pnpm --filter @agendario/web exec tsx -e '
  import { extractReceipt } from "./src/lib/openai/extract-receipt";
  extractReceipt(["https://..."]).then(console.log);
'
```

---

## 7. Instruções de tom

- Conciso, português, sem preâmbulo
- **Validar com usuário antes de cada commit grande** (são 3 commits sugeridos — confirmar entre cada um)
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Esta feature tem maior risco de bug — **ser rigoroso** com edge cases

### Armadilhas
- **OPENAI_API_KEY usado**: não logar nem expor. `getOpenAI()` já abstrai.
- **Imagens privadas**: usar **signed URLs** com TTL curto (5 min) ao passar pro LLM. `supabase.storage.createSignedUrl(path, 300)`.
- **Hash do arquivo**: SHA-256, hex. Compare apenas dentro do mesmo `user_id`.
- **PDF rendering**: testar com 3-4 PDFs reais (Nubank, Itaú, BB). Se falhar, ver perg. 1 (plano B).
- **`amount_cents` como STRING**: `Number(it.amount_brl * 100).toString()`. Cuidado com floats: usar `Math.round`.
- **`occurred_on` formato**: STRICT `YYYY-MM-DD`, sem timezone. Se LLM retornar `DD/MM/YYYY`, converter.
- **Truncate**: descrições de fatura podem ser MUITO longas ("PG ELO HORTIFRUTI ...").  Usar `truncate min-w-0 flex-1`.
- **Numeric precision**: LLMs às vezes retornam `89.9` quando o valor é `89.90`. Confiar no número (89.9 = 89.90 = 8990 cents).
- **Status enum**: `parsing` → `review` → `confirmed`. `failed` é terminal. Não regredir status.
- **Dedup hash**: se usuário sobe o mesmo arquivo 2x, retornar batch existente (não criar duplicado). User pode forçar reupload com query param `?force=1` se quiser refazer extração.
- **storage.foldername(name)**: garante que policy compara primeiro folder com user_id. Path DEVE começar com `{user_id}/...`.
- **Inngest retries**: function tem `retries: 2`. Se falhar 3x (1+2), batch fica em `parsing` status — adicionar timeout de 5min via cron pra marcar como `failed` com mensagem.
- **Idempotência**: `extract-receipt` usa step.run pra cachear LLM call (caro). Se a function for retentada, não chama LLM de novo.
- **OPENAI_MODEL_VISION fallback**: se `gpt-4.1-mini` der erro de modelo inexistente, fallback pra `gpt-4o-mini` (também faz vision). Adicionar try/catch.

---

**Esta feature é a de maior alavancagem do app.** Reserve tempo, valide com 3+ faturas reais antes de chamar de pronta. Comece por 4.1 (inspeção). Avise via Maestri se travar em PDF rendering ou em qualquer decisão arquitetural antes de codar muito.
