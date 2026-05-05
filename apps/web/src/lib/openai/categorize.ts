/**
 * LLM call para escolher uma categoria entre as do usuário.
 *
 * Estratégia:
 *   - Damos ao modelo a descrição da transação + lista (slug, name, type)
 *   - Modelo retorna { slug | null, confidence, reasoning }
 *   - Se confidence >= threshold, gravamos category_id
 *
 * Usa structured outputs (Zod) — mesmo padrão do parse-intent.
 */
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "./client";
import { serverEnv } from "@/env";

export const categorizeResponseSchema = z.object({
  slug: z.string().nullable().describe("Slug exato da categoria escolhida, ou null se nenhuma se encaixa bem"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("Curta justificativa em 1 frase"),
});

export type CategorizeResult = z.infer<typeof categorizeResponseSchema>;

export type CategoryOption = {
  slug: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

const SYSTEM_PROMPT = `Você é um classificador de transações financeiras pessoais para um médico brasileiro (intensivista/ultrasonografista).

Receberá uma descrição de transação + uma lista de categorias disponíveis. Sua tarefa: escolher o slug que melhor descreve a transação.

REGRAS:
- Use APENAS slugs da lista fornecida — nunca invente.
- Se nenhuma categoria se encaixa bem (confiança < 0.6), retorne slug=null.
- Combine sinais: contexto, tipo da transação (income/expense), termos médicos.
- Categorias com flag "(carne_leao)" são deduções fiscais (consultório, equipamento, congresso, anuidade CRM, etc.) — priorize quando aplicável a contexto profissional.

Confiança:
- 0.9-1.0: match óbvio (ex: "ifood" → alimentacao_delivery)
- 0.7-0.9: match razoável (ex: "uber" → transporte)
- 0.6-0.7: match plausível mas com ambiguidade
- <0.6: retorne slug=null`;

export async function categorizeTransaction(args: {
  description: string;
  type: "income" | "expense" | "transfer";
  amount_cents: number;
  categories: Array<CategoryOption & { deductible_carne_leao?: boolean }>;
}): Promise<CategorizeResult> {
  const client = getOpenAI();

  // Filtra por tipo (não fazemos categoria expense em income, etc.)
  const eligible = args.categories.filter((c) => c.type === args.type);
  if (eligible.length === 0) {
    return { slug: null, confidence: 0, reasoning: "no eligible categories for type" };
  }

  const list = eligible
    .map((c) => {
      const tag = c.deductible_carne_leao ? " (carne_leao)" : "";
      return `- ${c.slug}: ${c.name}${tag}`;
    })
    .join("\n");

  const userPrompt = [
    `Transação:`,
    `  Tipo: ${args.type}`,
    `  Valor: R$ ${(args.amount_cents / 100).toFixed(2)}`,
    `  Descrição: "${args.description}"`,
    ``,
    `Categorias disponíveis:`,
    list,
  ].join("\n");

  const completion = await client.beta.chat.completions.parse({
    model: serverEnv.OPENAI_MODEL_PARSE,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(categorizeResponseSchema, "category"),
    temperature: 0.1,
  });

  const result = completion.choices[0]?.message.parsed;
  if (!result) {
    throw new Error("OpenAI categorize: empty response");
  }

  // Defesa: se LLM retornou slug fora da lista, anula
  if (result.slug && !eligible.some((c) => c.slug === result.slug)) {
    return {
      slug: null,
      confidence: 0,
      reasoning: `slug inválido (${result.slug}) — não está na lista`,
    };
  }

  return result;
}
