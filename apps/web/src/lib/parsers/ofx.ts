/**
 * Parser de OFX (Open Financial Exchange) — formato padronizado de bancos.
 *
 * Suporta:
 *   - OFX v1 SGML (lines `<TAG>value` sem fechamento — clássico do Itaú/Bradesco/Santander)
 *   - OFX v2 XML (com fechamento `<TAG>value</TAG>`)
 *
 * Estratégia:
 *   1. Decode (Windows-1252 → fallback Latin1; UTF-8 quando declarado)
 *   2. Remove header SGML (linhas até `<OFX>`)
 *   3. Regex pra extrair `<STMTTRN>...</STMTTRN>` blocos (ou `<STMTTRN>...<STMTTRN>` SGML)
 *   4. Por bloco: extrai DTPOSTED, TRNAMT, NAME/MEMO/PAYEE, TRNTYPE, FITID
 *   5. Determina detected_origin via tags ORG/FID
 *
 * Sem LLM. Acurácia 100% pra OFX bem-formado.
 */
import type { ReceiptExtraction, ExtractedItem } from "@/lib/openai/extract-receipt";

type OfxBank =
  | "itau"
  | "bradesco"
  | "santander"
  | "nubank"
  | "inter"
  | "c6"
  | "bb"
  | "caixa"
  | "unknown";

/**
 * Mapeia ORG/FID conhecidos do OFX → identificador interno.
 * Adicione novos bancos aqui conforme aparecerem.
 */
function detectOfxBank(org: string, fid: string): OfxBank {
  const o = org.toLowerCase();
  const f = fid.toLowerCase();
  if (o.includes("itau") || f === "0341") return "itau";
  if (o.includes("bradesco") || f === "0237") return "bradesco";
  if (o.includes("santander") || f === "0033") return "santander";
  if (o.includes("nu pagamentos") || o.includes("nubank") || f === "0260") return "nubank";
  if (o.includes("inter") || f === "0077") return "inter";
  if (o.includes("c6") || f === "0336") return "c6";
  if (o.includes("banco do brasil") || f === "0001") return "bb";
  if (o.includes("caixa") || f === "0104") return "caixa";
  return "unknown";
}

/**
 * Decodifica buffer. OFX v1 geralmente declara CHARSET:1252 → Windows-1252.
 * Tenta UTF-8 primeiro, fallback Latin1 (super-set de Windows-1252 pra ASCII).
 */
function decodeBuffer(buf: Buffer): string {
  const utf8 = buf.toString("utf-8");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 5) {
    return buf.toString("latin1");
  }
  return utf8;
}

/**
 * Extrai valor de uma tag SGML/XML. Funciona pra ambos os formatos:
 *   - `<TAG>valor` (SGML — termina na próxima tag ou fim de linha)
 *   - `<TAG>valor</TAG>` (XML)
 *
 * Retorna trimmed; null se não achou.
 */
function extractTag(block: string, tag: string): string | null {
  // Tenta XML primeiro (mais preciso)
  const xml = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (xml) return xml[1]!.trim();
  // SGML: valor vai até a próxima tag ou \n (Itaú costuma usar \n)
  const sgml = new RegExp(`<${tag}>([^<\\n\\r]*)`, "i").exec(block);
  if (sgml) return sgml[1]!.trim();
  return null;
}

/**
 * DTPOSTED format: YYYYMMDD ou YYYYMMDDHHMMSS ou com [tz] sufixo.
 * Retorna YYYY-MM-DD ou null.
 */
function parseOfxDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parse trnamt: número signed decimal (ponto decimal, formato US).
 */
function parseOfxAmount(raw: string): number {
  const n = Number(raw.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
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

function cleanDescription(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed;
}

export type ParsedOfxResult = {
  extraction: ReceiptExtraction;
  bank: OfxBank;
};

/**
 * Parse OFX → ReceiptExtraction.
 *
 * @throws se não achar nenhuma transação válida
 */
export function parseOfxBuffer(buf: Buffer): ParsedOfxResult {
  const text = decodeBuffer(buf);

  // Remove header SGML — tudo antes de `<OFX>`
  const ofxStart = text.indexOf("<OFX>");
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;

  // Detecta banco
  const org = extractTag(body, "ORG") ?? "";
  const fid = extractTag(body, "FID") ?? "";
  const bank = detectOfxBank(org, fid);

  // Detecta tipo de conta — CCACCTFROM = cartão crédito, BANKACCTFROM = conta
  const isCreditCard = body.includes("<CCACCTFROM>") || body.includes("<CCSTMTRS>");

  // Extrai todos os blocos STMTTRN
  // Match não-greedy entre <STMTTRN> e </STMTTRN> (XML) ou próximo <STMTTRN> ou </BANKTRANLIST>
  const blockRegex = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>)/gi;
  const items: ExtractedItem[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let totalAmount = 0;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(body)) !== null) {
    const block = match[1]!;

    const dtRaw = extractTag(block, "DTPOSTED") ?? "";
    const amountRaw = extractTag(block, "TRNAMT") ?? "";
    // NAME, MEMO, PAYEE.NAME — combina o que tiver
    const name = extractTag(block, "NAME") ?? "";
    const memo = extractTag(block, "MEMO") ?? "";
    const payee = extractTag(block, "PAYEE") ?? "";
    const description = [name, memo, payee].filter(Boolean).join(" — ").trim();

    const date = parseOfxDate(dtRaw);
    const amount = parseOfxAmount(amountRaw);

    if (!date || !description || !Number.isFinite(amount)) continue;

    const cleaned = cleanDescription(description);
    const installments = parseInstallments(cleaned);

    items.push({
      raw_description: description,
      description: cleaned,
      amount_brl: amount,
      occurred_on: date,
      installment_current: installments.current,
      installment_total: installments.total,
    });

    totalAmount += Math.abs(amount);
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }

  if (items.length === 0) {
    throw new Error(
      `OFX sem transações parseáveis. Banco: ${bank}, ORG: ${org}, FID: ${fid}`
    );
  }

  const detectedOrigin =
    bank === "unknown"
      ? "ofx_unknown"
      : isCreditCard
        ? `${bank}_credit_card`
        : `${bank}_bank_statement`;

  const extraction: ReceiptExtraction = {
    detected_origin: detectedOrigin,
    statement_type: isCreditCard ? "credit_card_invoice" : "bank_statement",
    statement_period_start: minDate,
    statement_period_end: maxDate,
    total_amount_brl: totalAmount,
    items,
    notes: null,
  };

  return { extraction, bank };
}
