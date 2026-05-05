/**
 * Webhook Telegram — entrada única para mensagens E callback_query (botões inline).
 *
 * DEV (long-polling): apps/bot encaminha cada update com header `x-internal-secret`.
 * PROD: configurar webhook URL no Telegram apontando aqui (com secret_token via header).
 *
 * Fluxo:
 *   message.text → resolve telegram_user → cria inbox_item(pending) → dispara `inbox/item.parse-requested`
 *   callback_query → confirm/cancel → dispara `inbox/item.confirmed` ou marca `cancelled`
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { inboxItems, telegramUsers } from "@agendario/db";
import { inngest } from "@/lib/inngest/client";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/env";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram/api";
import { parseCallbackData } from "@/lib/telegram/preview";
import { processReceiptUpload } from "@/lib/telegram/receipts";

// ---------- Schemas ----------

const fromSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});

const photoSizeSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  width: z.number(),
  height: z.number(),
  file_size: z.number().optional(),
});

const documentSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().optional(),
});

const messageSchema = z.object({
  message_id: z.number(),
  from: fromSchema,
  chat: z.object({ id: z.number() }),
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(photoSizeSchema).optional(),
  document: documentSchema.optional(),
});

const callbackQuerySchema = z.object({
  id: z.string(),
  from: fromSchema,
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
    })
    .optional(),
  data: z.string(),
});

const updateSchema = z.object({
  update_id: z.number(),
  message: messageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
});

// ---------- Helpers ----------

async function resolveUser(telegramChatId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ user_id: telegramUsers.user_id })
    .from(telegramUsers)
    .where(eq(telegramUsers.telegram_chat_id, telegramChatId))
    .limit(1);
  return rows[0]?.user_id ?? null;
}

// ---------- POST ----------

export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get("x-internal-secret");
  if (
    serverEnv.TELEGRAM_WEBHOOK_SECRET &&
    internalSecret !== serverEnv.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = updateSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_payload", details: String(err) },
      { status: 400 }
    );
  }

  // ---------- callback_query (botão inline) ----------
  if (parsed.callback_query) {
    return handleCallback(parsed.callback_query);
  }

  // ---------- message ----------
  const message = parsed.message;
  if (!message) {
    return NextResponse.json({ ok: true, ignored: "no_message" });
  }

  const chatId = String(message.chat.id);

  // Comandos /start e /ping não exigem associação de conta
  if (message.text?.startsWith("/start")) {
    await sendMessage({
      chat_id: chatId,
      text: [
        "👋 Olá! Sou o bot do *Agendario*.",
        "",
        "Para associar este chat à sua conta, faça login no app web e cole seu chat\\_id:",
        `\`${chatId}\``,
        "",
        "Depois de associado, você pode me mandar:",
        "• mensagens livres (`gastei 50 no uber`)",
        "• fotos de fatura (📸 print do app do banco)",
        "• PDFs de extrato (anexe como documento)",
      ].join("\n"),
      parse_mode: "MarkdownV2",
    });
    return NextResponse.json({ ok: true });
  }

  if (message.text?.startsWith("/ping")) {
    await sendMessage({ chat_id: chatId, text: "pong 🏓" });
    return NextResponse.json({ ok: true });
  }

  // Resolver usuário (necessário pra todos os tipos de mensagem)
  const userId = await resolveUser(chatId);
  if (!userId) {
    await sendMessage({
      chat_id: chatId,
      text: `⚠️ Este chat não está associado a uma conta Agendario.\n\nUse /start para instruções.`,
    });
    return NextResponse.json({ ok: true, ignored: "unknown_user" });
  }

  // ---------- photo (fatura via foto) ----------
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    if (!largest) {
      return NextResponse.json({ ok: true, ignored: "empty_photo" });
    }
    await processReceiptUpload({
      userId,
      chatId,
      fileId: largest.file_id,
      fileName: null,
      mimeType: "image/jpeg",
      fileSize: largest.file_size ?? null,
      source: "telegram_image",
      messageId: message.message_id,
    });
    return NextResponse.json({ ok: true, batch: "queued" });
  }

  // ---------- document (PDF/imagem como anexo) ----------
  if (message.document) {
    await processReceiptUpload({
      userId,
      chatId,
      fileId: message.document.file_id,
      fileName: message.document.file_name ?? null,
      mimeType: message.document.mime_type ?? null,
      fileSize: message.document.file_size ?? null,
      source: "telegram_document",
      messageId: message.message_id,
    });
    return NextResponse.json({ ok: true, batch: "queued" });
  }

  // ---------- text (mensagem natural) ----------
  if (!message.text) {
    return NextResponse.json({ ok: true, ignored: "unsupported_message_type" });
  }

  // Persistir inbox_item (idempotente via external_id = telegram message_id)
  const db = getDb();
  const externalId = `tg:${chatId}:${message.message_id}`;
  const [inserted] = await db
    .insert(inboxItems)
    .values({
      user_id: userId,
      channel: "telegram",
      external_id: externalId,
      raw_content: message.text,
      status: "pending",
      received_at: new Date(message.date * 1000),
      metadata: {
        telegram_chat_id: chatId,
        telegram_message_id: message.message_id,
        telegram_username: message.from.username ?? null,
      },
    })
    .returning({ id: inboxItems.id })
    .onConflictDoNothing();

  if (!inserted) {
    // Duplicata: ignora silenciosamente
    return NextResponse.json({ ok: true, ignored: "duplicate" });
  }

  // Disparar parsing assíncrono
  await inngest.send({
    name: "inbox/item.parse-requested",
    data: { inbox_item_id: inserted.id },
  });

  return NextResponse.json({ ok: true, inbox_item_id: inserted.id });
}

// ---------- Callback handler ----------

async function handleCallback(cb: z.infer<typeof callbackQuerySchema>) {
  const decoded = parseCallbackData(cb.data);
  if (!decoded) {
    await answerCallbackQuery({
      callback_query_id: cb.id,
      text: "Botão inválido.",
      show_alert: true,
    });
    return NextResponse.json({ ok: true, ignored: "bad_callback" });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: inboxItems.id,
      user_id: inboxItems.user_id,
      status: inboxItems.status,
    })
    .from(inboxItems)
    .where(eq(inboxItems.id, decoded.inboxItemId))
    .limit(1);

  const item = rows[0];
  if (!item) {
    await answerCallbackQuery({
      callback_query_id: cb.id,
      text: "InboxItem não encontrado.",
      show_alert: true,
    });
    return NextResponse.json({ ok: true });
  }

  if (item.status !== "pending") {
    await answerCallbackQuery({
      callback_query_id: cb.id,
      text: `Já foi ${item.status}.`,
      show_alert: false,
    });
    return NextResponse.json({ ok: true });
  }

  if (decoded.action === "cancel") {
    await db
      .update(inboxItems)
      .set({ status: "rejected" })
      .where(eq(inboxItems.id, item.id));

    await answerCallbackQuery({ callback_query_id: cb.id, text: "Cancelado." });
    if (cb.message) {
      await sendMessage({
        chat_id: cb.message.chat.id,
        text: "❌ Cancelado.",
        reply_to_message_id: cb.message.message_id,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (decoded.action === "confirm") {
    // Disparar criação da entidade real via Inngest
    await inngest.send({
      name: "inbox/item.confirmed",
      data: { inbox_item_id: item.id },
    });

    await answerCallbackQuery({
      callback_query_id: cb.id,
      text: "Confirmado, processando...",
    });
    return NextResponse.json({ ok: true });
  }

  // edit — Phase 2
  await answerCallbackQuery({
    callback_query_id: cb.id,
    text: "Edição inline ainda não implementada — cancele e refaça.",
    show_alert: true,
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "telegram-webhook",
    accepts: ["message", "callback_query"],
  });
}
