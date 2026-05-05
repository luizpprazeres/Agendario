/**
 * Pipeline: inbox_item recém-criado → LLM parse → preview no Telegram.
 *
 * Steps:
 *   1. Carregar inbox_item (e sair se não-pending)
 *   2. Chamar OpenAI parseIntent (structured output)
 *   3. Persistir intent + payload + confidence + tokens
 *   4. Renderizar preview e enviar via Telegram Bot API
 *
 * Retries: 3 (default Inngest). Se OpenAI falhar 3x, cai em parse_error.
 */
import { eq } from "drizzle-orm";
import { inboxItems } from "@agendario/db";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { parseIntent } from "@/lib/openai/parse-intent";
import { renderPreview } from "@/lib/telegram/preview";
import { sendMessage } from "@/lib/telegram/api";
import { serverEnv } from "@/env";

export const parseInboxItem = inngest.createFunction(
  { id: "parse-inbox-item", retries: 3 },
  { event: "inbox/item.parse-requested" },
  async ({ event, step }) => {
    const { inbox_item_id } = event.data;
    const db = getDb();

    // 1. Carregar
    const item = await step.run("load-inbox-item", async () => {
      const rows = await db
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, inbox_item_id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!item) return { ok: false, reason: "not_found" };
    if (item.status !== "pending") {
      return { ok: false, reason: `not_pending:${item.status}` };
    }

    // 2. Parse via OpenAI
    const parsed = await step.run("openai-parse-intent", async () => {
      try {
        return await parseIntent(item.raw_content);
      } catch (err) {
        // Persistir erro e re-throw para retry
        await db
          .update(inboxItems)
          .set({
            parse_error: String(err instanceof Error ? err.message : err),
          })
          .where(eq(inboxItems.id, item.id));
        throw err;
      }
    });

    // 3. Atualizar inbox_item
    await step.run("persist-intent", async () => {
      await db
        .update(inboxItems)
        .set({
          intent: parsed.result.intent,
          confidence: parsed.confidence.toString(),
          payload: parsed.result,
          llm_model: serverEnv.OPENAI_MODEL_PARSE,
          parse_error: null,
        })
        .where(eq(inboxItems.id, item.id));
    });

    // 4. Enviar preview
    await step.run("send-telegram-preview", async () => {
      const meta = item.metadata as { telegram_chat_id?: string };
      if (!meta.telegram_chat_id) {
        throw new Error("telegram_chat_id ausente no metadata do inbox_item");
      }

      const { text, reply_markup } = renderPreview(
        item.id,
        parsed.result,
        parsed.confidence
      );
      await sendMessage({
        chat_id: meta.telegram_chat_id,
        text,
        parse_mode: "Markdown",
        reply_markup,
      });
    });

    return {
      ok: true,
      inbox_item_id: item.id,
      intent: parsed.result.intent,
      confidence: parsed.confidence,
    };
  }
);
