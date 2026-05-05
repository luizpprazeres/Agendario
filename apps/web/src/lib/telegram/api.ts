/**
 * Wrapper minimalista da Telegram Bot API.
 * Usa fetch nativo — sem grammY no server-side (grammY fica em apps/bot polling).
 *
 * Docs: https://core.telegram.org/bots/api
 */
import { serverEnv } from "@/env";

const BASE = "https://api.telegram.org/bot";

function token(): string {
  if (!serverEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN não configurada em .env.local");
  }
  return serverEnv.TELEGRAM_BOT_TOKEN;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API error (${method}): ${json.description}`);
  }
  return json.result as T;
}

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboard = InlineKeyboardButton[][];

export async function sendMessage(params: {
  chat_id: string | number;
  text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: { inline_keyboard: InlineKeyboard };
  reply_to_message_id?: number;
}) {
  return call<{ message_id: number; chat: { id: number } }>("sendMessage", params);
}

export async function editMessageText(params: {
  chat_id: string | number;
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: { inline_keyboard: InlineKeyboard };
}) {
  return call("editMessageText", params);
}

export async function answerCallbackQuery(params: {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}) {
  return call("answerCallbackQuery", params);
}
