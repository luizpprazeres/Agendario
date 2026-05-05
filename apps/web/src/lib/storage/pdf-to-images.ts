/**
 * PDF buffer → PNG por página → upload no bucket 'receipts' → signed URLs.
 *
 * Usa `pdf-to-img` (renderiza com pdfjs sem dep nativa de Canvas C++).
 * MVP: limita 5 páginas. Excedentes são descartados e relatados em notes.
 *
 * Ambiente: chamar APENAS server-side. Em Vercel/serverless, atenção: pdf-to-img
 * baixa fontes e usa workers. Se falhar em prod, plano B é skipar PDF
 * (só image/* no upload).
 */
import { pdf } from "pdf-to-img";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PAGES = 5;
const SIGNED_URL_TTL_SECONDS = 300; // 5 min — só pra LLM consumir e morrer

export type PdfToImagesResult = {
  signedUrls: string[];
  pagesTotal: number;
  pagesProcessed: number;
  truncated: boolean;
};

/**
 * @param supabase  client com sessão do user (RLS ativo)
 * @param userId    auth.uid() — primeiro segmento do path (storage policy)
 * @param batchId   id do inbox_batches — segundo segmento do path
 * @param pdfBuffer buffer do PDF original
 */
export async function pdfBufferToImages(args: {
  supabase: SupabaseClient;
  userId: string;
  batchId: string;
  pdfBuffer: Buffer;
}): Promise<PdfToImagesResult> {
  const { supabase, userId, batchId, pdfBuffer } = args;

  const document = await pdf(pdfBuffer, { scale: 2 });
  const pagesTotal = document.length;
  const pagesProcessed = Math.min(pagesTotal, MAX_PAGES);

  const signedUrls: string[] = [];
  let pageNumber = 0;
  for await (const pageImage of document) {
    pageNumber += 1;
    if (pageNumber > MAX_PAGES) break;

    const path = `${userId}/${batchId}/page-${pageNumber}.png`;
    const { error: uploadErr } = await supabase.storage
      .from("receipts")
      .upload(path, pageImage, { contentType: "image/png", upsert: true });
    if (uploadErr) {
      throw new Error(
        `Falha ao subir página ${pageNumber} do PDF: ${uploadErr.message}`
      );
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      throw new Error(
        `Falha ao gerar signed URL para página ${pageNumber}: ${signErr?.message ?? "no url"}`
      );
    }
    signedUrls.push(signed.signedUrl);
  }

  return {
    signedUrls,
    pagesTotal,
    pagesProcessed,
    truncated: pagesTotal > MAX_PAGES,
  };
}
