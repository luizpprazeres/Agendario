"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  confirmBatchAction,
  discardBatchAction,
  type ConfirmBatchInput,
  type EditedItem,
} from "./actions";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

type BatchHeader = {
  id: string;
  status: string;
  detected_origin_label: string;
  period_label: string | null;
  target_account_id: string | null;
  notes: string | null;
};

type ItemRow = {
  id: string;
  position: number;
  raw_description: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense" | "transfer";
  occurred_on: string;
  suggested_category_id: string | null;
  is_duplicate: boolean;
  installment_current: number | null;
  installment_total: number | null;
  status: string;
};

type CategoryOption = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  icon: string | null;
  color: string | null;
};

type AccountOption = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
};

export function BatchReview({
  batch,
  items: initialItems,
  categories,
  accounts,
}: {
  batch: BatchHeader;
  items: ItemRow[];
  categories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState<string | null>(
    batch.target_account_id ?? accounts[0]?.id ?? null
  );

  type EditState = {
    kept: boolean;
    description: string;
    category_id: string | null;
  };

  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    const map: Record<string, EditState> = {};
    for (const it of initialItems) {
      map[it.id] = {
        // Duplicatas começam DESMARCADAS por padrão
        kept: !it.is_duplicate && it.status === "pending",
        description: it.description,
        category_id: it.suggested_category_id,
      };
    }
    return map;
  });

  const isReadOnly = batch.status !== "review";

  const counts = useMemo(() => {
    let kept = 0;
    let total = 0;
    let keptCents = 0;
    for (const it of initialItems) {
      total += 1;
      const e = edits[it.id];
      if (e?.kept) {
        kept += 1;
        keptCents += it.amount_cents;
      }
    }
    return { kept, total, keptCents };
  }, [edits, initialItems]);

  const categoriesByType = useMemo(() => {
    const expense = categories.filter((c) => c.type === "expense");
    const income = categories.filter((c) => c.type === "income");
    return { expense, income };
  }, [categories]);

  function toggleAll(value: boolean) {
    setEdits((prev) => {
      const next = { ...prev };
      for (const it of initialItems) {
        next[it.id] = { ...next[it.id]!, kept: value };
      }
      return next;
    });
  }

  function setItemField<K extends keyof EditState>(
    itemId: string,
    field: K,
    value: EditState[K]
  ) {
    setEdits((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId]!, [field]: value },
    }));
  }

  function onConfirm() {
    if (!accountId) {
      setError("Escolha a conta antes de confirmar.");
      return;
    }
    if (counts.kept === 0) {
      setError("Selecione pelo menos um item.");
      return;
    }
    setError(null);

    const payload: ConfirmBatchInput = {
      batch_id: batch.id,
      target_account_id: accountId,
      items: initialItems.map<EditedItem>((it) => ({
        item_id: it.id,
        kept: edits[it.id]?.kept ?? false,
        description: edits[it.id]?.description ?? it.description,
        category_id: edits[it.id]?.category_id ?? null,
      })),
    };

    startTransition(async () => {
      const res = await confirmBatchAction(payload);
      if (!res.ok) {
        setError(`Falhou: ${res.error}`);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function onDiscard() {
    if (
      !confirm(
        "Descartar este batch? Os itens não serão criados e o histórico fica como descartado."
      )
    )
      return;
    startTransition(async () => {
      await discardBatchAction(batch.id);
    });
  }

  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl pb-32 sm:pb-10"
      style={{ background: "oklch(0.17 0.006 30)" }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-8">
        <div className="min-w-0">
          <Link
            href="/importar"
            className="text-xs"
            style={{ color: "oklch(0.55 0.006 30)" }}
          >
            ← importações
          </Link>
          <h1
            className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontStretch: "92%" }}
          >
            {batch.detected_origin_label}
          </h1>
          {batch.period_label ? (
            <p
              className="mt-0.5 text-xs"
              style={{ color: "oklch(0.55 0.006 30)" }}
            >
              {batch.period_label}
            </p>
          ) : null}
        </div>
      </header>

      <div className="space-y-3 px-4 sm:space-y-4 sm:px-6">
        {/* Sumário + escolha de conta */}
        <section
          className="rounded-3xl border p-5 sm:p-6"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.245 0.008 30)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p
                className="font-mono text-[10px] uppercase tracking-wider"
                style={{ color: "oklch(0.55 0.006 30)" }}
              >
                a confirmar
              </p>
              <p
                className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl"
                style={{ fontStretch: "90%" }}
              >
                {BRL.format(counts.keptCents / 100)}
              </p>
            </div>
            <div className="text-right">
              <p
                className="text-xs tabular-nums"
                style={{ color: "oklch(0.55 0.006 30)" }}
              >
                {counts.kept} de {counts.total}
              </p>
              {!isReadOnly ? (
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      borderColor: "oklch(0.28 0.008 30)",
                      color: "oklch(0.7 0.006 30)",
                    }}
                  >
                    todos
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      borderColor: "oklch(0.28 0.008 30)",
                      color: "oklch(0.7 0.006 30)",
                    }}
                  >
                    nenhum
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="mt-5 border-t pt-4"
            style={{ borderColor: "oklch(0.245 0.008 30)" }}
          >
            <label
              className="block font-mono text-[10px] uppercase tracking-wider"
              style={{ color: "oklch(0.55 0.006 30)" }}
            >
              conta destino
            </label>
            {accounts.length === 0 ? (
              <p
                className="mt-2 rounded-xl border px-3 py-2 text-xs"
                style={{
                  background: "oklch(0.245 0.008 30)",
                  borderColor: "oklch(0.28 0.008 30)",
                  color: "oklch(0.55 0.006 30)",
                }}
              >
                Nenhuma conta cadastrada. Crie uma antes de confirmar.
              </p>
            ) : (
              <select
                value={accountId ?? ""}
                onChange={(e) => setAccountId(e.target.value || null)}
                disabled={isReadOnly}
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                style={{
                  background: "oklch(0.245 0.008 30)",
                  borderColor: "oklch(0.28 0.008 30)",
                  color: "oklch(0.92 0.006 30)",
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.institution ? ` · ${a.institution}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {batch.notes ? (
            <p
              className="mt-3 rounded-xl border px-3 py-2 text-[11px]"
              style={{
                background: "oklch(0.27 0.05 80 / 0.2)",
                borderColor: "oklch(0.4 0.06 80 / 0.4)",
                color: "oklch(0.85 0.1 80)",
              }}
            >
              {batch.notes}
            </p>
          ) : null}
        </section>

        {/* Lista de items */}
        <section
          className="rounded-3xl border p-3 sm:p-4"
          style={{
            background: "oklch(0.21 0.007 30)",
            borderColor: "oklch(0.245 0.008 30)",
          }}
        >
          {initialItems.length === 0 ? (
            <p
              className="m-1 rounded-2xl border px-4 py-6 text-center text-xs"
              style={{
                background: "oklch(0.245 0.008 30)",
                borderColor: "oklch(0.28 0.008 30)",
                color: "oklch(0.55 0.006 30)",
              }}
            >
              Nenhum item extraído.
            </p>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: "oklch(0.245 0.008 30)" }}
            >
              {initialItems.map((it) => {
                const e = edits[it.id]!;
                const eligibleCats =
                  it.type === "income"
                    ? categoriesByType.income
                    : categoriesByType.expense;
                const isIncome = it.type === "income";
                return (
                  <li
                    key={it.id}
                    className="px-1.5 py-3 sm:px-2 sm:py-3.5"
                    style={{
                      opacity: e.kept ? 1 : 0.5,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={e.kept}
                        disabled={isReadOnly}
                        onChange={(ev) =>
                          setItemField(it.id, "kept", ev.target.checked)
                        }
                        className="mt-1 size-4 shrink-0 accent-emerald-400"
                        aria-label={`Manter ${it.description}`}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p
                            className="text-[11px] tabular-nums"
                            style={{ color: "oklch(0.55 0.006 30)" }}
                          >
                            {dateShort.format(
                              new Date(`${it.occurred_on}T00:00:00Z`)
                            )}
                            {it.installment_current && it.installment_total
                              ? ` · ${it.installment_current}/${it.installment_total}`
                              : ""}
                          </p>
                          <span
                            className={`shrink-0 text-sm font-medium tabular-nums ${
                              isIncome ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {isIncome ? "+ " : "− "}
                            {BRL.format(it.amount_cents / 100)}
                          </span>
                        </div>

                        {/* Descrição editável */}
                        <input
                          type="text"
                          value={e.description}
                          disabled={isReadOnly}
                          onChange={(ev) =>
                            setItemField(it.id, "description", ev.target.value)
                          }
                          className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1"
                          style={{
                            borderColor:
                              e.description !== it.description
                                ? "oklch(0.55 0.14 235 / 0.6)"
                                : "oklch(0.27 0.008 30)",
                            color: "oklch(0.95 0.006 30)",
                          }}
                        />

                        {/* Raw description (referência) */}
                        {e.description.toLowerCase().trim() !==
                        it.raw_description.toLowerCase().trim() ? (
                          <p
                            className="truncate font-mono text-[10px]"
                            style={{ color: "oklch(0.45 0.006 30)" }}
                            title={it.raw_description}
                          >
                            origem: {it.raw_description}
                          </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={e.category_id ?? ""}
                            disabled={isReadOnly}
                            onChange={(ev) =>
                              setItemField(
                                it.id,
                                "category_id",
                                ev.target.value || null
                              )
                            }
                            className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-[12px]"
                            style={{
                              background: "oklch(0.245 0.008 30)",
                              borderColor:
                                e.category_id !== it.suggested_category_id
                                  ? "oklch(0.55 0.14 235 / 0.6)"
                                  : "oklch(0.27 0.008 30)",
                              color: "oklch(0.85 0.006 30)",
                            }}
                          >
                            <option value="">Sem categoria</option>
                            {eligibleCats.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.icon &&
                                !/^[a-z0-9_-]+$/i.test(c.icon)
                                  ? `${c.icon} `
                                  : ""}
                                {c.name}
                              </option>
                            ))}
                          </select>

                          {it.is_duplicate ? (
                            <span
                              className="rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
                              style={{
                                background:
                                  "color-mix(in oklch, oklch(0.78 0.14 80) 18%, transparent)",
                                color: "oklch(0.78 0.14 80)",
                              }}
                              title="Provável duplicata de uma transação existente"
                            >
                              duplicata?
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Erro */}
        {error ? (
          <p
            className="rounded-xl border px-3 py-2 text-center text-xs"
            style={{
              background: "oklch(0.27 0.06 25 / 0.3)",
              borderColor: "oklch(0.4 0.08 25 / 0.5)",
              color: "oklch(0.85 0.12 25)",
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Ações */}
        {!isReadOnly ? (
          <div className="sticky bottom-3 flex gap-2 sm:bottom-4">
            <button
              type="button"
              onClick={onDiscard}
              disabled={isPending}
              className="grid h-12 flex-1 place-items-center rounded-2xl border text-sm font-medium disabled:opacity-50"
              style={{
                background: "oklch(0.245 0.008 30)",
                borderColor: "oklch(0.28 0.008 30)",
                color: "oklch(0.7 0.006 30)",
              }}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending || counts.kept === 0 || !accountId}
              className="grid h-12 flex-[2] place-items-center rounded-2xl border text-sm font-medium disabled:opacity-50"
              style={{
                background: "oklch(0.27 0.04 155 / 0.5)",
                borderColor: "oklch(0.4 0.06 155 / 0.5)",
                color: "oklch(0.92 0.05 155)",
              }}
            >
              {isPending
                ? "Processando…"
                : counts.kept === 0
                  ? "Selecione itens"
                  : `Confirmar ${counts.kept} ite${counts.kept === 1 ? "m" : "ns"}`}
            </button>
          </div>
        ) : (
          <p
            className="rounded-xl border px-3 py-2 text-center text-xs"
            style={{
              background: "oklch(0.245 0.008 30)",
              borderColor: "oklch(0.28 0.008 30)",
              color: "oklch(0.55 0.006 30)",
            }}
          >
            Este batch já foi {batch.status === "confirmed" ? "confirmado" : batch.status}.
          </p>
        )}
      </div>
    </main>
  );
}
