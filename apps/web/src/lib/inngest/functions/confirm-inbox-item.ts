/**
 * Confirma um inbox_item: cria a entidade real (transaction/shift/task/note)
 * e marca o inbox_item como `confirmed` com resolved_entity_*.
 *
 * Decisões de fallback:
 *   - transaction sem account_id resolvido → escolhe primeira conta ativa do usuário
 *     (Phase 2: prompt no Telegram para selecionar conta)
 *   - transaction sem categoria → deixa null (categorize-requested rodará depois)
 *   - shift/task → criados sem workplace_id se não existir (precisa criar workplace primeiro)
 */
import { and, eq } from "drizzle-orm";
import {
  categories,
  financialAccounts,
  inboxItems,
  shifts,
  tasks,
  transactions,
  workplaces,
} from "@agendario/db";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { sendMessage } from "@/lib/telegram/api";

export const confirmInboxItem = inngest.createFunction(
  { id: "confirm-inbox-item", retries: 2 },
  { event: "inbox/item.confirmed" },
  async ({ event, step }) => {
    const { inbox_item_id } = event.data;
    const db = getDb();

    const item = await step.run("load", async () => {
      const rows = await db
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, inbox_item_id))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!item) return { ok: false, reason: "not_found" };
    if (item.status !== "pending") {
      return { ok: false, reason: `not_pending:${item.status}` };
    }

    const payload = item.payload as { intent: string; [k: string]: unknown };
    const meta = item.metadata as { telegram_chat_id?: string };
    const chatId = meta.telegram_chat_id;

    let resolvedTable: string | null = null;
    let resolvedId: string | null = null;
    let successMsg: string;

    try {
      switch (payload.intent) {
        case "transaction": {
          const tx = payload as unknown as {
            type: "income" | "expense" | "transfer";
            amount_cents: number;
            description: string;
            occurred_on: string;
            category_hint: string | null;
            workplace_hint: string | null;
            notes: string | null;
          };

          // Resolve account: primeira conta ativa do usuário
          const accountRows = await db
            .select({ id: financialAccounts.id })
            .from(financialAccounts)
            .where(
              and(
                eq(financialAccounts.user_id, item.user_id),
                eq(financialAccounts.is_archived, false)
              )
            )
            .limit(1);

          const account = accountRows[0];
          if (!account) {
            throw new Error(
              "Nenhuma conta financeira cadastrada. Crie uma conta antes."
            );
          }

          // Resolve category por slug se hint bater
          let categoryId: string | null = null;
          if (tx.category_hint) {
            const catRows = await db
              .select({ id: categories.id })
              .from(categories)
              .where(
                and(
                  eq(categories.user_id, item.user_id),
                  eq(categories.slug, tx.category_hint)
                )
              )
              .limit(1);
            categoryId = catRows[0]?.id ?? null;
          }

          const insertedRows = await db
            .insert(transactions)
            .values({
              user_id: item.user_id,
              account_id: account.id,
              category_id: categoryId,
              type: tx.type,
              amount_cents: String(
                tx.type === "expense" ? -Math.abs(tx.amount_cents) : Math.abs(tx.amount_cents)
              ),
              description: tx.description,
              occurred_on: tx.occurred_on,
              source: "telegram",
              external_id: `inbox:${item.id}`,
              notes: tx.notes,
            })
            .returning({ id: transactions.id });

          const inserted = insertedRows[0];
          if (!inserted) throw new Error("Falha ao inserir transação");

          resolvedTable = "transactions";
          resolvedId = inserted.id;
          successMsg = `✅ Transação registrada${categoryId ? "" : " (sem categoria — vou tentar inferir depois)"}.`;

          if (!categoryId) {
            await inngest.send({
              name: "transactions/categorize-requested",
              data: { transaction_id: inserted.id },
            });
          }
          break;
        }

        case "shift": {
          const sh = payload as unknown as {
            workplace_hint: string;
            starts_at: string;
            ends_at: string;
            pay_cents: number | null;
            notes: string | null;
          };

          // Resolve ou cria workplace
          let workplaceId: string;
          const wpRows = await db
            .select({ id: workplaces.id })
            .from(workplaces)
            .where(
              and(
                eq(workplaces.user_id, item.user_id),
                eq(workplaces.name, sh.workplace_hint)
              )
            )
            .limit(1);
          const existingWp = wpRows[0];
          if (existingWp) {
            workplaceId = existingWp.id;
          } else {
            const newRows = await db
              .insert(workplaces)
              .values({ user_id: item.user_id, name: sh.workplace_hint })
              .returning({ id: workplaces.id });
            const newWp = newRows[0];
            if (!newWp) throw new Error("Falha ao criar workplace");
            workplaceId = newWp.id;
          }

          const insertedRows = await db
            .insert(shifts)
            .values({
              user_id: item.user_id,
              workplace_id: workplaceId,
              starts_at: new Date(sh.starts_at),
              ends_at: new Date(sh.ends_at),
              pay_cents: sh.pay_cents ? String(sh.pay_cents) : null,
              status: "scheduled",
              notes: sh.notes,
            })
            .returning({ id: shifts.id });

          const inserted = insertedRows[0];
          if (!inserted) throw new Error("Falha ao inserir plantão");

          resolvedTable = "shifts";
          resolvedId = inserted.id;
          successMsg = `✅ Plantão agendado em *${sh.workplace_hint}*.`;
          break;
        }

        case "task": {
          const tk = payload as unknown as {
            title: string;
            due_date: string | null;
            scheduled_start: string | null;
            scheduled_end: string | null;
            priority: "low" | "medium" | "high" | "urgent" | null;
            notes: string | null;
          };

          const insertedRows = await db
            .insert(tasks)
            .values({
              user_id: item.user_id,
              title: tk.title,
              due_at: tk.due_date ? new Date(`${tk.due_date}T23:59:00-03:00`) : null,
              scheduled_start: tk.scheduled_start ? new Date(tk.scheduled_start) : null,
              scheduled_end: tk.scheduled_end ? new Date(tk.scheduled_end) : null,
              priority: tk.priority ?? "medium",
              status: "todo",
              description: tk.notes,
            })
            .returning({ id: tasks.id });

          const inserted = insertedRows[0];
          if (!inserted) throw new Error("Falha ao inserir tarefa");

          resolvedTable = "tasks";
          resolvedId = inserted.id;
          successMsg = `✅ Tarefa criada: *${tk.title}*`;
          break;
        }

        case "note": {
          // Notas ficam só no inbox_item — sem entidade separada.
          resolvedTable = "inbox_items";
          resolvedId = item.id;
          successMsg = `✅ Nota salva.`;
          break;
        }

        default:
          throw new Error(`Intent não suportado: ${payload.intent}`);
      }

      await db
        .update(inboxItems)
        .set({
          status: "confirmed",
          resolved_entity_table: resolvedTable,
          resolved_entity_id: resolvedId,
          confirmed_at: new Date(),
        })
        .where(eq(inboxItems.id, item.id));

      if (chatId) {
        await sendMessage({
          chat_id: chatId,
          text: successMsg,
          parse_mode: "Markdown",
        });
      }

      return { ok: true, resolvedTable, resolvedId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(inboxItems)
        .set({ parse_error: msg })
        .where(eq(inboxItems.id, item.id));

      if (chatId) {
        await sendMessage({
          chat_id: chatId,
          text: `⚠️ Erro ao confirmar: ${msg}`,
        });
      }
      throw err;
    }
  }
);
