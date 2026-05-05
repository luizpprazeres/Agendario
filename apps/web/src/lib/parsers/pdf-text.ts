/**
 * Extração de texto de PDF para LLM.
 *
 * Substitui `pdf-to-images.ts` (que usava `pdf-to-img` + DOMMatrix → quebra
 * em runtime serverless do Vercel).
 *
 * Stack: `unpdf` — wrapper sobre pdfjs com builds serverless-friendly,
 * sem deps nativas (canvas, DOMMatrix etc). Extrai texto puro.
 *
 * Limites:
 *   - Funciona perfeitamente em PDFs digitais (Nubank, Itaú, Bradesco, Inter,
 *     Santander, C6 — todos geram digital)
 *   - PDFs ESCANEADOS (foto de papel exportada) retornam texto vazio →
 *     handler cai pro caminho de imagem (caller decide)
 *
 * Sem upload no Storage. Texto fica em memória, vai direto pro LLM.
 */
const MAX_TEXT_CHARS = 200_000; // ~50 páginas densas — limite seguro pro context do gpt-4o-mini

export type PdfTextResult = {
  text: string;
  pagesTotal: number;
  truncated: boolean;
};

/**
 * @param pdfBuffer buffer do PDF original
 * @throws se o PDF estiver corrompido (unpdf lança)
 */
export async function pdfBufferToText(pdfBuffer: Buffer): Promise<PdfTextResult> {
  // Lazy import — unpdf carrega pdfjs internamente; mantém boot leve.
  const { extractText, getDocumentProxy } = await import("unpdf");

  // unpdf aceita Uint8Array; Buffer estende Uint8Array, mas TS reclama.
  const uint8 = new Uint8Array(
    pdfBuffer.buffer,
    pdfBuffer.byteOffset,
    pdfBuffer.byteLength
  );

  const proxy = await getDocumentProxy(uint8);
  const { text, totalPages } = await extractText(proxy, { mergePages: true });

  const merged = Array.isArray(text) ? text.join("\n\n") : text;
  const truncated = merged.length > MAX_TEXT_CHARS;
  const finalText = truncated ? merged.slice(0, MAX_TEXT_CHARS) : merged;

  return {
    text: finalText,
    pagesTotal: totalPages,
    truncated,
  };
}
