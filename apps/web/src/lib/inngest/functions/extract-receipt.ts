/**
 * Pipeline: inbox_batch (status=parsing) → vision LLM → items + status=review
 *
 * Steps (cada step.run cacheia o resultado pra retry seguro):
 *   1. load-batch        — carrega e checa status
 *   2. prepare-images    — gera signed URLs (PDF → split em PNGs antes)
 *   3. extract           — LLM call (caro — cacheado)
 *   4. load-aliases      — aliases do user pra renomeação automática
 *   5. load-recent-tx    — últimas 200 transactions pra detecção de duplicatas
 *   6. save-items        — INSERT bulk em inbox_batch_items
 *   7. finalize-batch    — UPDATE status='review' + sumários
 *
 * Falha → retry 2x. Após 3 tentativas (1+2), batch fica em 'parsing'; cron
 * futuro pode marcar 'failed' (fora do escopo MVP).
 */
import { desc, eq } from "drizzle-orm";
import {
  inboxBatchItems,
  inboxBatches,
  transactions,
} from "@agendario/db";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { applyAliases, loadUserAliases, type AliasRow } from "@/lib/aliases";
import { extractReceipt } from "@/lib/openai/extract-receipt";
import { pdfBufferToImages } from "@/lib/storage/pdf-to-images";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SECONDS = 300;

export const extractReceiptFn = inngest.createFunction(
  { id: "extract-receipt", retries: 2 },
  { event: "receipts/extract-requested" },
  async ({ event, step, logger }) => {
    const { batch_id } = event.data;
    const db = getDb();
    const supabase = createSupabaseServiceClient();

    // 1. Carrega batch e checa status
    const batch = await step.run("load-batch", async () => {
      const rows = await db
        .select()
        .from(inboxBatches)
        .where(eq(inboxBatches.id, batch_id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!batch) {
      logger.warn("batch_not_found", { batch_id });
      return { ok: false, reason: "not_found" };
    }
    if (batch.status !== "parsing") {
      logger.info("batch already processed", { batch_id, status: batch.status });
      return { ok: false, reason: `not_parsing:${batch.status}` };
    }
    if (!batch.source_file_url) {
      throw new Error("batch sem source_file_url");
    }
    if (!batch.source_file_type) {
      throw new Error("batch sem source_file_type");
    }

    // 2. Prepara imagens — signed URLs do que já é image, ou converte PDF
    const prepared = await step.run("prepare-images", async () => {
      const filePath = batch.source_file_url!;
      const fileType = batch.source_file_type!;

      if (fileType.startsWith("image/")) {
        const { data: signed, error } = await supabase.storage
          .from("receipts")
          .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
        if (error || !signed?.signedUrl) {
          throw new Error(`signed url falhou: ${error?.message ?? "no url"}`);
        }
        return {
          signedUrls: [signed.signedUrl],
          pagesTotal: 1,
          pagesProcessed: 1,
          truncated: false,
        };
      }

      if (fileType === "application/pdf") {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("receipts")
          .download(filePath);
        if (dlErr || !blob) {
          throw new Error(`download PDF falhou: ${dlErr?.message ?? "no blob"}`);
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        return await pdfBufferToImages({
          supabase,
          userId: batch.user_id,
          batchId: batch.id,
          pdfBuffer: buffer,
        });
      }

      throw new Error(`tipo não suportado: ${fileType}`);
    });

    // 3. Vision LLM — caro, step.run garante cache em retry
    const extraction = await step.run("extract", async () => {
      try {
        return await extractReceipt(prepared.signedUrls);
      } catch (err) {
        await db
          .update(inboxBatches)
          .set({
            error_message: String(err instanceof Error ? err.message : err),
          })
          .where(eq(inboxBatches.id, batch.id));
        throw err;
      }
    });

    // 4. Aliases do user
    const aliases: AliasRow[] = await step.run("load-aliases", async () => {
      return await loadUserAliases(batch.user_id);
    });

    // 5. Últimas 200 transactions do user pra detecção de duplicatas
    const recentTx = await step.run("load-recent-tx", async () => {
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

    // 6. Persistir items
    const itemsResult = await step.run("save-items", async () => {
      const rows = extraction.items.map((it, idx) => {
        const aliasMatch = applyAliases(it.raw_description, aliases);
        const finalDescription = aliasMatch?.canonical_name ?? it.description;
        // amount_cents sempre POSITIVO; sinal vem de `type`
        const absAmountCents = Math.round(Math.abs(it.amount_brl) * 100);
        const txType = it.amount_brl >= 0 ? "income" : "expense";
        const dup = findDuplicate(
          recentTx,
          finalDescription,
          absAmountCents,
          it.occurred_on,
          txType
        );

        return {
          user_id: batch.user_id,
          batch_id: batch.id,
          position: idx,
          raw_description: it.raw_description,
          description: finalDescription,
          amount_cents: absAmountCents.toString(),
          type: txType as "income" | "expense",
          occurred_on: it.occurred_on,
          suggested_category_id: aliasMatch?.suggested_category_id ?? null,
          installment_current: it.installment_current,
          installment_total: it.installment_total,
          is_duplicate: !!dup,
          duplicate_of_transaction_id: dup?.id ?? null,
          status: "pending",
        };
      });

      if (rows.length > 0) {
        await db.insert(inboxBatchItems).values(rows);
      }
      return { count: rows.length };
    });

    // 7. Finaliza batch
    await step.run("finalize-batch", async () => {
      const totalCents = extraction.items.reduce(
        (sum, i) => sum + Math.round(Math.abs(i.amount_brl) * 100),
        0
      );
      const noteParts: string[] = [];
      if (prepared.truncated) {
        noteParts.push(
          `PDF truncado: processadas ${prepared.pagesProcessed}/${prepared.pagesTotal} páginas (limite MVP)`
        );
      }
      if (extraction.notes) noteParts.push(extraction.notes);
      const notes = noteParts.length > 0 ? noteParts.join(" — ") : null;

      await db
        .update(inboxBatches)
        .set({
          status: "review",
          detected_origin: extraction.detected_origin,
          statement_period_start: extraction.statement_period_start,
          statement_period_end: extraction.statement_period_end,
          total_count: itemsResult.count,
          total_amount_cents: totalCents.toString(),
          raw_extraction: extraction as never,
          notes,
          error_message: null,
        })
        .where(eq(inboxBatches.id, batch.id));
    });

    return {
      ok: true,
      batch_id: batch.id,
      item_count: itemsResult.count,
      detected_origin: extraction.detected_origin,
    };
  }
);

type RecentTx = {
  id: string;
  description: string;
  amount_cents: string;
  occurred_on: string;
};

/**
 * Match heurístico:
 *   - mesmo dia
 *   - mesmo valor absoluto (cents)
 *   - descrição compartilha pelo menos os 12 primeiros chars (case-insensitive)
 */
function findDuplicate(
  recent: RecentTx[],
  description: string,
  amountCents: number,
  occurredOn: string,
  _type: "income" | "expense"
): RecentTx | undefined {
  const head = description.slice(0, 12).toLowerCase();
  return recent.find(
    (t) =>
      t.occurred_on === occurredOn &&
      Number(t.amount_cents) === amountCents &&
      t.description.toLowerCase().includes(head)
  );
}
