/**
 * Pipeline pra receber faturas/extratos via Telegram (foto ou documento PDF).
 *
 * Fluxo:
 *   1. getFile → file_path na CDN do Telegram
 *   2. Download dos bytes
 *   3. Validação tipo + tamanho
 *   4. Hash SHA-256 → dedupe por (user_id, source_file_hash)
 *   5. INSERT inbox_batches (status='parsing', source='telegram_image|telegram_document')
 *   6. Upload no bucket 'receipts' via service-role (bypassa RLS)
 *   7. UPDATE source_file_url
 *   8. inngest.send('receipts/extract-requested')
 *   9. sendMessage com link pra /importar/{batch_id}
 *
 * Mensagens de erro retornam ao chat. Falhas silenciosas só em logs.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { inboxBatches } from "@agendario/db";
import { clientEnv, serverEnv } from "@/env";
import { getDb } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { sendMessage } from "./api";

const ALLOWED_TYPES = new Set([
  // Imagens (Vision)
  "image/png",
  "image/jpeg",
  "image/webp",
  // PDF (texto extraído + LLM)
  "application/pdf",
  // CSV / OFX (parseados deterministicamente, sem LLM)
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel", // alguns bancos enviam CSV com mime XLS
  "application/x-ofx",
  "application/vnd.intu.qfx",
  "application/x-qfx",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export type ReceiptSource = "telegram_image" | "telegram_document";

export type ProcessReceiptInput = {
  userId: string;
  chatId: string;
  fileId: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  source: ReceiptSource;
  messageId: number;
};

type GetFileResult = {
  file_id: string;
  file_path?: string;
  file_size?: number;
};

async function telegramGetFile(token: string, fileId: string): Promise<GetFileResult | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const json = (await res.json()) as {
    ok: boolean;
    result?: GetFileResult;
    description?: string;
  };
  if (!json.ok || !json.result) return null;
  return json.result;
}

async function telegramDownload(token: string, filePath: string): Promise<Buffer | null> {
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function inferMimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".ofx")) return "application/x-ofx";
  if (lower.endsWith(".qfx")) return "application/vnd.intu.qfx";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg"; // photos do Telegram são JPEG por padrão
}

export async function processReceiptUpload(input: ProcessReceiptInput): Promise<void> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[receipts] TELEGRAM_BOT_TOKEN não configurado");
    return;
  }

  // 1. getFile
  const fileInfo = await telegramGetFile(token, input.fileId);
  if (!fileInfo?.file_path) {
    await sendMessage({
      chat_id: input.chatId,
      text: "⚠️ Não consegui acessar o arquivo. Tente reenviar.",
    });
    return;
  }

  // 2. Download
  const buffer = await telegramDownload(token, fileInfo.file_path);
  if (!buffer) {
    await sendMessage({
      chat_id: input.chatId,
      text: "⚠️ Falha ao baixar o arquivo do Telegram.",
    });
    return;
  }

  // 3. Validate — se mime do Telegram for genérico ou ausente, infere pela extensão
  const isGenericMime =
    !input.mimeType ||
    input.mimeType === "application/octet-stream" ||
    input.mimeType === "application/binary";
  const mimeType = isGenericMime
    ? inferMimeFromPath(input.fileName ?? fileInfo.file_path)
    : input.mimeType!;
  if (!ALLOWED_TYPES.has(mimeType)) {
    await sendMessage({
      chat_id: input.chatId,
      text: `⚠️ Tipo não suportado: \`${mimeType}\`. Envie PNG, JPG, WEBP ou PDF.`,
      parse_mode: "Markdown",
    });
    return;
  }
  if (buffer.byteLength > MAX_BYTES) {
    await sendMessage({
      chat_id: input.chatId,
      text: `⚠️ Arquivo maior que 25MB (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB).`,
    });
    return;
  }

  // 4. Hash + dedup
  const hash = createHash("sha256").update(buffer).digest("hex");
  const db = getDb();

  const [existing] = await db
    .select({ id: inboxBatches.id, status: inboxBatches.status })
    .from(inboxBatches)
    .where(
      and(
        eq(inboxBatches.user_id, input.userId),
        eq(inboxBatches.source_file_hash, hash)
      )
    )
    .limit(1);

  if (existing) {
    const url = `${clientEnv.NEXT_PUBLIC_APP_URL}/importar/${existing.id}`;
    await sendMessage({
      chat_id: input.chatId,
      text: `📋 Esta fatura já foi recebida.\n\n[Abrir review](${url})`,
      parse_mode: "Markdown",
    });
    return;
  }

  // 5. Insert batch
  const [created] = await db
    .insert(inboxBatches)
    .values({
      user_id: input.userId,
      source: input.source,
      source_file_type: mimeType,
      source_file_size_bytes: buffer.byteLength,
      source_file_hash: hash,
      status: "parsing",
      metadata: {
        telegram_chat_id: input.chatId,
        telegram_message_id: input.messageId,
      },
    })
    .returning({ id: inboxBatches.id });

  if (!created) {
    await sendMessage({
      chat_id: input.chatId,
      text: "⚠️ Erro ao criar lote. Tente de novo.",
    });
    return;
  }

  // 6. Upload via service role
  const safeName = (input.fileName ?? `telegram-${Date.now()}`).replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  const path = `${input.userId}/${created.id}/source-${Date.now()}-${safeName}`;

  const admin = createSupabaseServiceClient();
  const { error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (uploadErr) {
    await db
      .update(inboxBatches)
      .set({ status: "failed", error_message: uploadErr.message })
      .where(eq(inboxBatches.id, created.id));
    await sendMessage({
      chat_id: input.chatId,
      text: `⚠️ Falha no upload: ${uploadErr.message}`,
    });
    return;
  }

  await db
    .update(inboxBatches)
    .set({ source_file_url: path })
    .where(eq(inboxBatches.id, created.id));

  // 7. Dispatch Inngest
  await inngest.send({
    name: "receipts/extract-requested",
    data: { batch_id: created.id },
  });

  // 8. Reply — mensagem ajustada ao formato (CSV/OFX é instantâneo, LLM demora mais)
  const url = `${clientEnv.NEXT_PUBLIC_APP_URL}/importar/${created.id}`;
  const isStructured =
    mimeType.includes("csv") ||
    mimeType.includes("ofx") ||
    mimeType.includes("qfx") ||
    mimeType === "application/vnd.ms-excel";
  const isPdf = mimeType === "application/pdf";

  const intro = isStructured
    ? "📊 *CSV/OFX recebido.* Processando..."
    : isPdf
      ? "📄 *PDF recebido.* Lendo o texto..."
      : "📸 *Fatura recebida.* Lendo a imagem...";
  const expected = isStructured
    ? "_Pronto em segundos._"
    : isPdf
      ? "_Vai levar 5–15 segundos._"
      : "_Vai levar 10–30 segundos._";

  await sendMessage({
    chat_id: input.chatId,
    text: [
      intro,
      "",
      `[Acompanhar processamento](${url})`,
      "",
      `${expected} _Quando terminar, abra o link acima pra confirmar as transações._`,
    ].join("\n"),
    parse_mode: "Markdown",
  });
}
