/**
 * Parser determinístico de CSV de fatura/extrato bancário BR.
 *
 * Estratégia:
 *   1. Decode buffer (UTF-8 com fallback Latin1 — Itaú/Bradesco usam ISO-8859-1)
 *   2. papaparse com auto-detect de separador (vírgula vs ponto-e-vírgula)
 *   3. Detecta banco pelo conjunto de cabeçalhos (Nubank, Itaú, Bradesco, Inter, C6)
 *   4. Aplica mapeamento de colunas + parser numérico (BR vs US decimal)
 *   5. Retorna ReceiptExtraction (mesmo schema da extração via LLM)
 *
 * Sem LLM. Sem custo. Acurácia ~100% pra CSVs reconhecidos.
 */
import Papa from "papaparse";
import type { ReceiptExtraction, ExtractedItem } from "@/lib/openai/extract-receipt";

type DetectedBank =
  | "nubank_credit"
  | "nubank_account"
  | "itau"
  | "bradesco"
  | "inter"
  | "c6"
  | "santander"
  | "generic";

type ColumnMap = {
  date: string[];
  description: string[];
  // Coluna única de valor com sinal
  amount?: string[];
  // Ou coluna separada de débito/crédito (Bradesco)
  credit?: string[];
  debit?: string[];
};

// Cabeçalhos conhecidos por banco (case-insensitive, normalizado)
const BANK_HEADERS: Record<DetectedBank, string[][]> = {
  nubank_credit: [["date", "title", "amount"]],
  nubank_account: [["data", "valor", "identificador", "descricao"]],
  itau: [["data", "estabelecimento", "portador", "valor"]],
  bradesco: [["data", "historico", "credito", "debito", "saldo"]],
  inter: [
    ["data", "lancamento", "historico", "valor", "saldo"],
    ["data lancamento", "historico", "descricao", "valor", "saldo"],
  ],
  c6: [
    ["data de compra", "nome no cartao", "final do cartao", "categoria", "descricao", "parcela", "valor (em us$)", "cotacao (em us$)", "valor (em r$)"],
    ["data", "descricao", "cartao", "categoria", "parcela", "valor"],
  ],
  santander: [["data", "historico", "valor", "saldo"]],
  generic: [],
};

const BANK_COLUMNS: Record<Exclude<DetectedBank, "generic">, ColumnMap> = {
  nubank_credit: {
    date: ["date"],
    description: ["title"],
    amount: ["amount"],
  },
  nubank_account: {
    date: ["data"],
    description: ["descricao"],
    amount: ["valor"],
  },
  itau: {
    date: ["data"],
    description: ["estabelecimento", "historico", "descricao"],
    amount: ["valor", "valor (r$)"],
  },
  bradesco: {
    date: ["data"],
    description: ["historico"],
    credit: ["credito", "credito (r$)"],
    debit: ["debito", "debito (r$)"],
  },
  inter: {
    date: ["data lancamento", "data"],
    description: ["descricao", "historico"],
    amount: ["valor"],
  },
  c6: {
    date: ["data de compra", "data"],
    description: ["descricao"],
    amount: ["valor (em r$)", "valor"],
  },
  santander: {
    date: ["data"],
    description: ["historico"],
    amount: ["valor"],
  },
};

/**
 * Normaliza header pra comparação: lowercase, sem acentos, trim.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .replace(/[\r\n\t]/g, "")
    .trim();
}

/**
 * Decodifica buffer tentando UTF-8 primeiro. Se vier muitos caracteres de
 * substituição (replacement char), tenta Latin1.
 */
function decodeBuffer(buf: Buffer): string {
  const utf8 = buf.toString("utf-8");
  // Replacement char � indica decode errado
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 5) {
    return buf.toString("latin1");
  }
  return utf8;
}

/**
 * Tenta detectar o banco pelos headers. Retorna 'generic' se não bater.
 */
function detectBank(headers: string[]): DetectedBank {
  const normalized = headers.map(normalize);
  for (const [bank, patterns] of Object.entries(BANK_HEADERS)) {
    if (bank === "generic") continue;
    for (const pattern of patterns) {
      // Match: todos os elementos do pattern aparecem em algum header
      const allMatch = pattern.every((p) =>
        normalized.some((h) => h.includes(p))
      );
      if (allMatch) return bank as DetectedBank;
    }
  }
  return "generic";
}

/**
 * Parser numérico tolerante: aceita "1.234,56" (BR), "1,234.56" (US), "8782.64" (sem milhares).
 * Heurística: se tem vírgula DEPOIS de ponto, BR. Se só vírgula com 2 dígitos no final, BR.
 */
function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().replace(/\s|R\$|US\$/gi, "");
  // Remove sinal pra processar e reaplicar
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // Detecta formato BR (vírgula é decimal)
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // BR: pontos são milhares, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma !== -1 && lastDot !== -1) {
    // US: vírgulas são milhares, ponto é decimal
    s = s.replace(/,/g, "");
  } else if (lastComma !== -1 && lastDot === -1) {
    // Só vírgula: assumir BR se tem 1-2 dígitos depois
    const after = s.length - lastComma - 1;
    if (after <= 2) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : NaN;
}

/**
 * Parse de data. Suporta DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY.
 * Retorna YYYY-MM-DD ou null.
 */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY ou DD-MM-YYYY
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (br) {
    const dd = br[1]!.padStart(2, "0");
    const mm = br[2]!.padStart(2, "0");
    let yyyy = br[3]!;
    if (yyyy.length === 2) {
      // 2-digit year: assume 20XX
      yyyy = `20${yyyy}`;
    }
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Acha valor de uma coluna olhando lista de candidates (case-insensitive, normalizado).
 */
function pickColumn(
  row: Record<string, string>,
  candidates: string[],
  normalizedKeys: Map<string, string>
): string {
  for (const cand of candidates) {
    const key = normalizedKeys.get(normalize(cand));
    if (key && row[key] != null) return row[key];
  }
  return "";
}

/**
 * Detecta parcelamento "X/Y" em descrição.
 */
function parseInstallments(description: string): {
  current: number | null;
  total: number | null;
} {
  const m = description.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return { current: null, total: null };
  return { current: Number(m[1]), total: Number(m[2]) };
}

/**
 * Limpa descrição: trim + colapso de espaços + first letter upper.
 */
function cleanDescription(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  // Mantém capitalização se já tiver mix; senão capitalize
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed;
}

export type ParsedCsvResult = {
  extraction: ReceiptExtraction;
  bank: DetectedBank;
};

/**
 * Parse CSV → ReceiptExtraction.
 *
 * @throws se não conseguir mapear colunas mínimas (data + valor + descrição)
 */
export function parseCsvBuffer(buf: Buffer): ParsedCsvResult {
  const text = decodeBuffer(buf);

  // papaparse com delimiter detection (testa , ; \t |)
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error("CSV vazio ou sem linhas após o header");
  }

  const rawHeaders = parsed.meta.fields ?? [];
  if (rawHeaders.length === 0) {
    throw new Error("CSV sem cabeçalho identificável");
  }

  const bank = detectBank(rawHeaders);
  const cols: ColumnMap =
    bank === "generic"
      ? // Heurística: tenta nomes mais comuns
        {
          date: ["data", "date", "data lancamento", "data de compra"],
          description: [
            "descricao",
            "description",
            "title",
            "historico",
            "estabelecimento",
            "memo",
          ],
          amount: ["valor", "amount", "value", "valor (r$)", "valor (em r$)"],
          credit: ["credito", "credit", "credito (r$)"],
          debit: ["debito", "debit", "debito (r$)"],
        }
      : BANK_COLUMNS[bank];

  // Mapa normalizado → header original (pra acesso case-insensitive sem acento)
  const normalizedKeys = new Map<string, string>();
  for (const h of rawHeaders) {
    normalizedKeys.set(normalize(h), h);
  }

  const items: ExtractedItem[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of parsed.data) {
    if (!row || typeof row !== "object") continue;

    const rawDate = pickColumn(row, cols.date, normalizedKeys);
    const rawDesc = pickColumn(row, cols.description, normalizedKeys);

    const date = parseDate(rawDate);
    if (!date || !rawDesc) continue;

    let amount: number;
    if (cols.amount) {
      const rawAmount = pickColumn(row, cols.amount, normalizedKeys);
      amount = parseAmount(rawAmount);
      // Convenção Nubank cartão: valor positivo = expense → inverter sinal
      if (bank === "nubank_credit" && Number.isFinite(amount)) {
        amount = -amount;
      }
    } else if (cols.credit && cols.debit) {
      const cred = parseAmount(pickColumn(row, cols.credit, normalizedKeys));
      const deb = parseAmount(pickColumn(row, cols.debit, normalizedKeys));
      if (Number.isFinite(cred) && cred !== 0) amount = cred;
      else if (Number.isFinite(deb) && deb !== 0) amount = -Math.abs(deb);
      else continue;
    } else {
      continue;
    }
    if (!Number.isFinite(amount)) continue;

    const cleanedDesc = cleanDescription(rawDesc);
    const installments = parseInstallments(cleanedDesc);

    items.push({
      raw_description: rawDesc,
      description: cleanedDesc,
      amount_brl: amount,
      occurred_on: date,
      installment_current: installments.current,
      installment_total: installments.total,
    });

    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }

  if (items.length === 0) {
    throw new Error(
      `Nenhuma linha de transação parseada. Banco detectado: ${bank}. Headers: ${rawHeaders.join(", ")}`
    );
  }

  // Origem padronizada para detected_origin (compatível com extração via LLM)
  const detectedOrigin: Record<DetectedBank, string> = {
    nubank_credit: "nubank_invoice",
    nubank_account: "nubank_account",
    itau: "itau_extract",
    bradesco: "bradesco_extract",
    inter: "inter_extract",
    c6: "c6_invoice",
    santander: "santander_extract",
    generic: "csv_unknown",
  };

  const extraction: ReceiptExtraction = {
    detected_origin: detectedOrigin[bank],
    statement_type:
      bank === "nubank_credit" || bank === "c6"
        ? "credit_card_invoice"
        : "bank_statement",
    statement_period_start: minDate,
    statement_period_end: maxDate,
    total_amount_brl: items.reduce((sum, it) => sum + Math.abs(it.amount_brl), 0),
    items,
    notes: bank === "generic" ? "CSV genérico — colunas inferidas" : null,
  };

  return { extraction, bank };
}
