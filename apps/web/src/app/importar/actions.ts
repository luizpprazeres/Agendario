"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  inboxBatchItems,
  inboxBatches,
  transactions,
} from "@agendario/db";
import { getDb } from "@/lib/db";
import { upsertAlias } from "@/lib/aliases";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EditedItem = {
  item_id: string;
  kept: boolean;
  description: string;
  category_id: string | null;
};

export type ConfirmBatchInput = {
  batch_id: string;
  target_account_id: string;
  items: EditedItem[];
};

export type ConfirmBatchResult =
  | { ok: true; created_count: number; discarded_count: number }
  | { ok: false; error: string };

/**
 * Confirma um batch:
 *   - itens kept=true viram transactions (sign aplicado pelo type já no item)
 *   - itens kept=false viram status='discarded'
 *   - se item teve description editada (vs raw_description) OU category_id mudou,
 *     persistimos um alias pra aprender (raw → canonical + categoria)
 *   - batch vai pra status='confirmed', target_account_id setado
 */
export async function confirmBatchAction(
  input: ConfirmBatchInput
): Promise<ConfirmBatchResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const db = getDb();

  // Carrega batch (autorização: user_id) e items pra cruzar com edits
  const [batch] = await db
    .select()
    .from(inboxBatches)
    .where(
      and(
        eq(inboxBatches.id, input.batch_id),
        eq(inboxBatches.user_id, user.id)
      )
    )
    .limit(1);
  if (!batch) return { ok: false, error: "batch_not_found" };
  if (batch.status !== "review") {
    return { ok: false, error: `batch_status_${batch.status}` };
  }

  const editedById = new Map(input.items.map((it) => [it.item_id, it]));
  const itemIds = input.items.map((it) => it.item_id);
  if (itemIds.length === 0) return { ok: false, error: "no_items" };

  const dbItems = await db
    .select()
    .from(inboxBatchItems)
    .where(
      and(
        eq(inboxBatchItems.user_id, user.id),
        eq(inboxBatchItems.batch_id, input.batch_id),
        inArray(inboxBatchItems.id, itemIds)
      )
    );

  let createdCount = 0;
  let discardedCount = 0;

  await db.transaction(async (tx) => {
    for (const item of dbItems) {
      const edit = editedById.get(item.id);
      if (!edit) continue;

      if (!edit.kept) {
        await tx
          .update(inboxBatchItems)
          .set({ status: "discarded" })
          .where(eq(inboxBatchItems.id, item.id));
        discardedCount += 1;
        continue;
      }

      // Sinal: expense vira negativo, income positivo. transfer fica positivo (raro aqui).
      const absCents = Number(item.amount_cents);
      const signedCents =
        item.type === "expense" ? -absCents : absCents;

      const [createdTx] = await tx
        .insert(transactions)
        .values({
          user_id: user.id,
          account_id: input.target_account_id,
          category_id: edit.category_id,
          type: item.type,
          status: "cleared",
          amount_cents: signedCents.toString(),
          currency: "BRL",
          description: edit.description.trim(),
          occurred_on: item.occurred_on,
          source: "ofx_import",
          metadata: {
            from_batch_id: batch.id,
            from_batch_item_id: item.id,
            raw_description: item.raw_description,
            installment_current: item.installment_current,
            installment_total: item.installment_total,
          },
        })
        .returning({ id: transactions.id });

      if (!createdTx) continue;

      await tx
        .update(inboxBatchItems)
        .set({
          status: "confirmed",
          transaction_id: createdTx.id,
          description: edit.description.trim(),
          suggested_category_id: edit.category_id,
        })
        .where(eq(inboxBatchItems.id, item.id));

      // Aprendizagem: se a descrição mudou OU a categoria mudou, salva alias
      const descChanged =
        edit.description.trim().toLowerCase() !==
        item.description.toLowerCase();
      const categoryChanged =
        (edit.category_id ?? null) !== (item.suggested_category_id ?? null);

      if (descChanged || categoryChanged) {
        await upsertAlias({
          userId: user.id,
          pattern: item.raw_description,
          canonicalName: edit.description.trim(),
          suggestedCategoryId: edit.category_id,
        });
      }

      createdCount += 1;
    }

    await tx
      .update(inboxBatches)
      .set({
        status: "confirmed",
        target_account_id: input.target_account_id,
        confirmed_at: sql`now()`,
      })
      .where(eq(inboxBatches.id, batch.id));
  });

  revalidatePath("/dashboard");
  revalidatePath("/importar");
  revalidatePath(`/importar/${batch.id}`);

  return { ok: true, created_count: createdCount, discarded_count: discardedCount };
}

export async function discardBatchAction(
  batchId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const db = getDb();
  await db
    .update(inboxBatches)
    .set({ status: "discarded" })
    .where(
      and(
        eq(inboxBatches.id, batchId),
        eq(inboxBatches.user_id, user.id)
      )
    );

  revalidatePath("/importar");
  redirect("/importar");
}
