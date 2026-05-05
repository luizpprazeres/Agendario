/**
 * POST /api/receipts/upload
 *
 * Recebe FormData com `file` (image/* ou application/pdf, max 25MB).
 * Fluxo:
 *   1. Auth (cookies)
 *   2. Validação de tipo + tamanho
 *   3. SHA-256 do conteúdo → dedupe por (user_id, source_file_hash).
 *      Se existe batch com mesmo hash, retorna { duplicate: true, batch_id }.
 *   4. INSERT inbox_batches (status='parsing')
 *   5. Upload no bucket 'receipts' em {user_id}/{batch_id}/source-...
 *   6. UPDATE batch.source_file_url
 *   7. inngest.send('receipts/extract-requested')
 *   8. Retorna { batch_id }
 *
 * Em caso de falha de upload, marca batch como 'failed' antes de retornar 500.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { inboxBatches } from "@agendario/db";
import { getDb } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "invalid_type", message: `tipo não suportado: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "arquivo maior que 25MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");

  const db = getDb();

  // Dedup: já existe batch com mesmo hash pra esse user?
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

  // Cria o batch primeiro pra obter o id (path do Storage usa batch_id)
  const [created] = await db
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

  if (!created) {
    return NextResponse.json(
      { error: "create_batch_failed" },
      { status: 500 }
    );
  }

  // Path: {user_id}/{batch_id}/source-{timestamp}-{filename}
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${created.id}/source-${Date.now()}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from("receipts")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await db
      .update(inboxBatches)
      .set({ status: "failed", error_message: uploadErr.message })
      .where(eq(inboxBatches.id, created.id));
    return NextResponse.json(
      { error: "upload_failed", message: uploadErr.message },
      { status: 500 }
    );
  }

  await db
    .update(inboxBatches)
    .set({ source_file_url: path })
    .where(eq(inboxBatches.id, created.id));

  await inngest.send({
    name: "receipts/extract-requested",
    data: { batch_id: created.id },
  });

  return NextResponse.json({ batch_id: created.id });
}
