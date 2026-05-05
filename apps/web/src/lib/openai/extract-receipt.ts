/**
 * Extração de fatura/extrato via OpenAI.
 *
 * Dois modos:
 *   - `extractReceiptFromImages(urls)` — usa Vision (gpt-4.1-mini). Pra fotos.
 *   - `extractReceiptFromText(text)` — usa modelo barato de texto (gpt-4o-mini).
 *     Pra PDFs digitais (Nubank, Itaú, Bradesco etc) onde texto é selecionável.
 *
 * Mesmo schema/prompt em ambos. Mesmo padrão de categorize.ts:
 *   beta.chat.completions.parse + zodResponseFormat.
 */
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./client";
import { serverEnv } from "@/env";

export const extractedItemSchema = z.object({
  raw_description: z
    .string()
    .describe("Texto exato como aparece na fatura, sem limpeza"),
  description: z
    .string()
    .describe("Descrição limpa, primeira letra maiúscula, sem prefixos genéricos"),
  amount_brl: z
    .number()
    .describe(
      "Valor em reais. Sinal: POSITIVO para crédito/income, NEGATIVO para débito/expense"
    ),
  occurred_on: z
    .string()
    .describe("Data YYYY-MM-DD. Infira o ano pelo período da fatura se faltar"),
  installment_current: z
    .number()
    .nullable()
    .describe("Se descrição tem 'X/Y' (ex: 'MACBOOK 3/12'), retorne X"),
  installment_total: z
    .number()
    .nullable()
    .describe("Se descrição tem 'X/Y' (ex: 'MACBOOK 3/12'), retorne Y"),
});

export const extractionSchema = z.object({
  detected_origin: z
    .string()
    .describe(
      "Origem do documento: 'nubank_invoice', 'itau_extract', 'bb_invoice', 'caixa', 'inter', 'c6', 'santander', 'unknown'"
    ),
  statement_type: z.enum([
    "credit_card_invoice",
    "bank_statement",
    "single_receipt",
    "unknown",
  ]),
  statement_period_start: z
    .string()
    .nullable()
    .describe("Início do período (YYYY-MM-DD) ou null se não identificável"),
  statement_period_end: z
    .string()
    .nullable()
    .describe("Fim do período (YYYY-MM-DD) ou null"),
  total_amount_brl: z
    .number()
    .nullable()
    .describe("Total da fatura/extrato se mostrado, senão null"),
  items: z.array(extractedItemSchema),
  notes: z
    .string()
    .nullable()
    .describe(
      "Observações relevantes: imagem borrada, ambiguidade, páginas truncadas, etc."
    ),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ReceiptExtraction = z.infer<typeof extractionSchema>;

const SYSTEM_PROMPT = `Você processa faturas de cartão de crédito e extratos bancários BRASILEIROS em português.

REGRAS DE EXTRAÇÃO:
- Inclua APENAS linhas de transação real
- IGNORE: saldo anterior, saldo atual, totais, subtotais, cabeçalhos de seção, datas isoladas, vencimentos, "Pagamento recebido — obrigado"
- Sinal: crédito/income é POSITIVO, débito/expense é NEGATIVO
- Datas: formato YYYY-MM-DD. Se a fatura mostra "12/05" sem ano, infira pelo período da fatura
- Parcelamento: detecte padrão "X/Y" em descrições (ex: "MACBOOK 3/12") e preencha installment_current/total
- Limpe descrições removendo prefixos genéricos ("PAYPAL *", "EBANX *", "MP *", "PG *") sem perder o vendor real
- Mantenha raw_description com texto EXATO da fonte
- Se a fonte estiver borrada/ilegível/parcial, retorne só o que tiver certeza e mencione em notes

NUNCA invente transações que não estão visíveis. Prefira retornar menos itens com alta confiança.`;

/**
 * Extração via Vision (imagens). Mantém compat com receipts.ts antigo.
 */
export async function extractReceiptFromImages(
  imageUrls: string[]
): Promise<ReceiptExtraction> {
  if (imageUrls.length === 0) {
    throw new Error("extractReceiptFromImages: imageUrls vazio");
  }

  const client = getOpenAI();
  const model = serverEnv.OPENAI_MODEL_VISION;

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: "Extraia as transações desta(s) imagem(ns). Lembre: ignore saldos e totais, retorne só linhas de transação reais.",
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  const completion = await client.beta.chat.completions.parse({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(extractionSchema, "receipt_extraction"),
    temperature: 0.1,
  });

  const result = completion.choices[0]?.message.parsed;
  if (!result) {
    throw new Error("OpenAI extractReceiptFromImages: empty response");
  }
  return result;
}

/**
 * Extração via texto puro (PDFs digitais). Usa modelo de parse (gpt-4o-mini)
 * — ~10x mais barato que Vision, sem perda de acurácia em PDFs com texto
 * selecionável.
 */
export async function extractReceiptFromText(
  text: string
): Promise<ReceiptExtraction> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("extractReceiptFromText: texto vazio");
  }

  const client = getOpenAI();
  const model = serverEnv.OPENAI_MODEL_PARSE;

  const completion = await client.beta.chat.completions.parse({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extraia as transações deste texto extraído de fatura/extrato. Lembre: ignore saldos, totais, headers de seção, datas isoladas, "pagamento recebido — obrigado".

--- TEXTO DO DOCUMENTO ---
${trimmed}
--- FIM ---`,
      },
    ],
    response_format: zodResponseFormat(extractionSchema, "receipt_extraction"),
    temperature: 0.1,
  });

  const result = completion.choices[0]?.message.parsed;
  if (!result) {
    throw new Error("OpenAI extractReceiptFromText: empty response");
  }
  return result;
}

/**
 * @deprecated Use extractReceiptFromImages ou extractReceiptFromText.
 * Mantido por retrocompatibilidade com call sites antigos.
 */
export const extractReceipt = extractReceiptFromImages;
