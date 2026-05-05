/**
 * Categoriza uma transaction recém-criada via LLM.
 *
 * Disparado por `transactions/categorize-requested` (do confirm-inbox-item)
 * quando a transação foi criada sem category_id (LLM do parse-intent não bateu
 * com nenhum slug exato).
 *
 * Estratégia:
 *   1. Carrega transaction + lista de categorias do usuário (filtradas por type)
 *   2. Chama OpenAI categorize → { slug, confidence }
 *   3. Se confidence >= 0.6 e slug existe, atualiza category_id
 *   4. (Opcional Phase 2) Notifica usuário via Telegram quando categoriza
 */
import { and, eq } from "drizzle-orm";
import { categories, transactions, telegramUsers } from "@agendario/db";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { categorizeTransaction } from "@/lib/openai/categorize";
import { sendMessage } from "@/lib/telegram/api";

const CONFIDENCE_THRESHOLD = 0.6;

export const categorizeTransactionFn = inngest.createFunction(
  { id: "categorize-transaction", retries: 2 },
  { event: "transactions/categorize-requested" },
  async ({ event, step }) => {
    const { transaction_id } = event.data;
    const db = getDb();

    // 1. Carregar transaction
    const tx = await step.run("load-transaction", async () => {
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transaction_id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!tx) return { ok: false, reason: "transaction_not_found" };
    if (tx.category_id) {
      return { ok: false, reason: "already_categorized" };
    }

    // 2. Carregar categorias elegíveis (mesmo type)
    const userCategories = await step.run("load-categories", async () => {
      return db
        .select({
          slug: categories.slug,
          name: categories.name,
          type: categories.type,
          deductible_carne_leao: categories.deductible_carne_leao,
        })
        .from(categories)
        .where(eq(categories.user_id, tx.user_id));
    });

    if (userCategories.length === 0) {
      return { ok: false, reason: "no_categories" };
    }

    // 3. Chamar LLM
    const result = await step.run("openai-categorize", async () => {
      return categorizeTransaction({
        description: tx.description ?? "",
        type: tx.type,
        amount_cents: Math.abs(Number(tx.amount_cents)),
        categories: userCategories,
      });
    });

    // 4. Decidir se aplica
    if (!result.slug || result.confidence < CONFIDENCE_THRESHOLD) {
      return {
        ok: true,
        applied: false,
        reason: `low_confidence:${result.confidence}`,
        suggestion: result,
      };
    }

    // 5. Resolver slug → category_id e atualizar transaction
    const updated = await step.run("apply-category", async () => {
      const catRows = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(
          and(
            eq(categories.user_id, tx.user_id),
            eq(categories.slug, result.slug!)
          )
        )
        .limit(1);

      const cat = catRows[0];
      if (!cat) return null;

      await db
        .update(transactions)
        .set({ category_id: cat.id })
        .where(eq(transactions.id, tx.id));

      return cat;
    });

    if (!updated) {
      return { ok: false, reason: "slug_not_resolved" };
    }

    // 6. Notificar usuário (best-effort — não bloqueia)
    await step.run("notify-user", async () => {
      const tgRows = await db
        .select({ chat_id: telegramUsers.telegram_chat_id })
        .from(telegramUsers)
        .where(
          and(
            eq(telegramUsers.user_id, tx.user_id),
            eq(telegramUsers.is_active, true)
          )
        )
        .limit(1);

      const chatId = tgRows[0]?.chat_id;
      if (!chatId) return { skipped: true };

      const conf = (result.confidence * 100).toFixed(0);
      await sendMessage({
        chat_id: chatId,
        text: `🏷️ Categoria definida: *${updated.name}* _(${conf}% confiança)_`,
        parse_mode: "Markdown",
      });
      return { sent: true };
    });

    return {
      ok: true,
      applied: true,
      category: updated.name,
      confidence: result.confidence,
    };
  }
);
