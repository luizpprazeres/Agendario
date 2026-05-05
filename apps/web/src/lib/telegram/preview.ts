/**
 * Render de preview por intent + inline keyboard de confirmação.
 *
 * callback_data layout: "inbox:<action>:<inbox_item_id>"
 *   action ∈ {confirm, cancel, edit}
 *
 * Limite Telegram callback_data: 64 bytes — UUID (36) + prefix (~14) cabe.
 */
import type { ParsedIntent } from "@/lib/openai/parse-intent";
import type { InlineKeyboard } from "./api";

function fmtBRL(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDate(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m || !m[1] || !m[2] || !m[3]) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Recife",
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export type PreviewRender = {
  text: string;
  reply_markup: { inline_keyboard: InlineKeyboard };
};

export function renderPreview(
  inboxItemId: string,
  intent: ParsedIntent,
  confidence: number
): PreviewRender {
  const confidenceBadge =
    confidence >= 0.8 ? "🟢" : confidence >= 0.6 ? "🟡" : "🔴";

  let text: string;

  switch (intent.intent) {
    case "transaction": {
      const sign = intent.type === "income" ? "+" : intent.type === "expense" ? "-" : "↔";
      text = [
        `*${confidenceBadge} Transação detectada*`,
        ``,
        `*Tipo:* ${intent.type === "income" ? "Entrada" : intent.type === "expense" ? "Saída" : "Transferência"}`,
        `*Valor:* ${sign} ${fmtBRL(intent.amount_cents)}`,
        `*Descrição:* ${intent.description}`,
        `*Data:* ${fmtDate(intent.occurred_on)}`,
        intent.category_hint ? `*Categoria sugerida:* ${intent.category_hint}` : null,
        intent.workplace_hint ? `*Local:* ${intent.workplace_hint}` : null,
        intent.notes ? `*Notas:* ${intent.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }

    case "shift": {
      text = [
        `*${confidenceBadge} Plantão detectado*`,
        ``,
        `*Local:* ${intent.workplace_hint}`,
        `*Início:* ${fmtDateTime(intent.starts_at)}`,
        `*Fim:* ${fmtDateTime(intent.ends_at)}`,
        intent.pay_cents ? `*Valor:* ${fmtBRL(intent.pay_cents)}` : null,
        intent.notes ? `*Notas:* ${intent.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }

    case "task": {
      text = [
        `*${confidenceBadge} Tarefa detectada*`,
        ``,
        `*Título:* ${intent.title}`,
        intent.due_date ? `*Prazo:* ${fmtDate(intent.due_date)}` : null,
        intent.scheduled_start
          ? `*Bloco:* ${fmtDateTime(intent.scheduled_start)}${intent.scheduled_end ? ` → ${fmtDateTime(intent.scheduled_end)}` : ""}`
          : null,
        intent.priority ? `*Prioridade:* ${intent.priority}` : null,
        intent.notes ? `*Notas:* ${intent.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }

    case "note": {
      text = [`*${confidenceBadge} Nota*`, ``, intent.body].join("\n");
      break;
    }

    case "unknown": {
      text = [
        `🤔 *Não consegui classificar com confiança*`,
        ``,
        `Motivo: ${intent.reason}`,
        ``,
        `Tente reformular ou cancele.`,
      ].join("\n");
      break;
    }
  }

  const reply_markup: { inline_keyboard: InlineKeyboard } = {
    inline_keyboard:
      intent.intent === "unknown"
        ? [[{ text: "❌ Cancelar", callback_data: `inbox:cancel:${inboxItemId}` }]]
        : [
            [
              { text: "✅ Confirmar", callback_data: `inbox:confirm:${inboxItemId}` },
              { text: "❌ Cancelar", callback_data: `inbox:cancel:${inboxItemId}` },
            ],
          ],
  };

  return { text, reply_markup };
}

export type CallbackAction = "confirm" | "cancel" | "edit";

export function parseCallbackData(
  data: string
): { action: CallbackAction; inboxItemId: string } | null {
  const m = /^inbox:(confirm|cancel|edit):([0-9a-f-]{36})$/i.exec(data);
  if (!m || !m[1] || !m[2]) return null;
  return { action: m[1] as CallbackAction, inboxItemId: m[2] };
}
