/**
 * Classificador de intenção via OpenAI structured output.
 *
 * Modelo: gpt-4o-mini (configurável via OPENAI_MODEL_PARSE).
 * Output: discriminated union via Zod, validada antes de retornar.
 *
 * Intents suportados (MVP):
 *   - transaction       (despesa/receita financeira)
 *   - shift             (plantão médico)
 *   - task              (tarefa pessoal/profissional)
 *   - note              (anotação livre, sem ação automática)
 *   - unknown           (não confiante — caia para fallback)
 */
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./client";
import { serverEnv } from "@/env";

// ---------- Schemas ----------

const transactionPayload = z.object({
  intent: z.literal("transaction"),
  type: z.enum(["income", "expense", "transfer"]),
  amount_cents: z
    .number()
    .int()
    .describe("Valor em centavos (BRL). Ex: R$ 150,50 → 15050"),
  description: z.string().describe("Descrição curta da transação"),
  occurred_on: z
    .string()
    .describe("Data ISO (YYYY-MM-DD). Se não informado, hoje em America/Recife"),
  category_hint: z
    .string()
    .nullable()
    .describe("Slug ou nome de categoria sugerida — null se não inferível"),
  workplace_hint: z
    .string()
    .nullable()
    .describe("Nome do hospital/clínica se mencionado"),
  notes: z.string().nullable(),
});

const shiftPayload = z.object({
  intent: z.literal("shift"),
  workplace_hint: z.string().describe("Nome do hospital/clínica"),
  starts_at: z.string().describe("ISO datetime com timezone"),
  ends_at: z.string().describe("ISO datetime com timezone"),
  pay_cents: z.number().int().nullable(),
  notes: z.string().nullable(),
});

const taskPayload = z.object({
  intent: z.literal("task"),
  title: z.string(),
  due_date: z.string().nullable().describe("ISO date (YYYY-MM-DD)"),
  scheduled_start: z.string().nullable().describe("ISO datetime"),
  scheduled_end: z.string().nullable().describe("ISO datetime"),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable(),
  notes: z.string().nullable(),
});

const notePayload = z.object({
  intent: z.literal("note"),
  body: z.string(),
});

const unknownPayload = z.object({
  intent: z.literal("unknown"),
  reason: z.string(),
});

// OpenAI structured outputs requer schema com root como object — discriminated union
// é representado como object com `intent` discriminator na resposta.
export const parseIntentResponseSchema = z.object({
  result: z.discriminatedUnion("intent", [
    transactionPayload,
    shiftPayload,
    taskPayload,
    notePayload,
    unknownPayload,
  ]),
  confidence: z.number().min(0).max(1),
  raw_reasoning: z
    .string()
    .describe("1-2 frases explicando como chegou à classificação"),
});

export type ParseIntentResponse = z.infer<typeof parseIntentResponseSchema>;
export type ParsedIntent = ParseIntentResponse["result"];

// ---------- System prompt ----------

const SYSTEM_PROMPT = `Você é o classificador de intenção do Agendario, um workspace pessoal de um médico intensivista brasileiro.

Sua tarefa: analisar UMA mensagem curta enviada via Telegram e classificar em UM destes intents:

1. **transaction** — qualquer registro financeiro:
   - "gastei 50 no uber", "ifood 32,90", "recebi plantão hosp x 1500"
   - amount_cents: SEMPRE em centavos. R$50 = 5000, R$32,90 = 3290
   - type: income (entrada) | expense (saída) | transfer (entre contas)
   - occurred_on: data ISO (YYYY-MM-DD). Se "hoje"/"agora"/sem data → use hoje em America/Recife.

2. **shift** — plantão médico:
   - "plantão UPA Caruaru sex 19h às sab 7h"
   - "plantão Real Hospital Português 12h amanhã noturno"
   - starts_at/ends_at: ISO datetime com offset -03:00 (Recife não tem horário de verão)

3. **task** — tarefa/lembrete:
   - "lembrar de renovar CRM dia 15"
   - "estudar ECG quinta 9-11h"

4. **note** — anotação livre, sem ação:
   - "ideia: pesquisar curso de ecocardiografia avançada"

5. **unknown** — quando não houver confiança razoável.

Regras:
- Se ambíguo entre transaction e shift, prefira **shift** quando houver hospital + horário, e **transaction** quando houver valor monetário sem horário de plantão.
- Datas relativas ("amanhã", "sexta", "dia 15") → resolver para data absoluta assumindo hoje = ${new Date().toISOString().slice(0, 10)} em America/Recife.
- Valores em reais sempre como inteiro de centavos.
- confidence: 0.0-1.0. Use < 0.6 quando incerto.
- Sempre preencha raw_reasoning (1-2 frases).`;

// ---------- API ----------

export async function parseIntent(text: string): Promise<ParseIntentResponse> {
  const client = getOpenAI();
  const completion = await client.beta.chat.completions.parse({
    model: serverEnv.OPENAI_MODEL_PARSE,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: zodResponseFormat(parseIntentResponseSchema, "intent"),
    temperature: 0.1,
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("OpenAI retornou parsed=null (refusal ou erro de schema)");
  }
  return parsed;
}

// Token usage extractor — para logar em inbox_items.llm_tokens_*
export function extractUsage(completion: {
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}) {
  return {
    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
    completion_tokens: completion.usage?.completion_tokens ?? 0,
  };
}
