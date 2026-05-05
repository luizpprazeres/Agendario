# Handoff: Bills (contas a pagar)

**Data:** 2026-05-05
**Status:** aguardando início — escopo fechado, depende de Subscriptions estar mergeado pra evitar conflito em `dashboard/page.tsx`
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Adicionar **Bills** ao Agendario: schema novo pra contas a pagar (boletos, faturas, plano de saúde, condomínio, internet), com vencimento, status (pending/paid/overdue), e bloco no `/dashboard` mostrando próximos vencimentos com badge de urgência. **Action "marcar pago"** atualiza apenas o status (a transaction associada vem via Telegram em fase 2).

Esta é a **segunda feature** de "entidade nova" pós-redesign Native. Padrão a replicar: schema → migration → RLS policy → seed → query → UI block. Mesmo padrão de Subscriptions.

---

## 2. Contexto essencial

### Pré-requisitos
- **Subscriptions DEVE estar mergeada** antes de começar Bills — ambas tocam em `apps/web/src/app/dashboard/page.tsx` e podem conflitar. Se Subscriptions ainda não foi commitada, espere.
- Migration de Subscriptions deve ter rodado (`pnpm db:migrate`)

### Stack
- Idêntica a Subscriptions (Drizzle + Supabase + Next.js + Drizzle direct queries com filtro manual user_id)
- Schemas helpers: `packages/db/src/schema/_shared.ts`
- RLS policies: `packages/db/sql/`
- Estilo Native já aplicado no `/dashboard` — copiar padrão

### Padrões obrigatórios (mesmos de Subscriptions)
- snake_case columns
- `amount_cents` em decimal STRING
- `metadata jsonb default '{}'`
- timestamps padrão via `timestampsColumns()`
- RLS policy permissiva owner-only
- Drizzle direct + filtro manual user_id (TODO já documentado)

### Restrições
- **NÃO commitar** sem aprovação visual do usuário
- **NÃO** criar `/financas/bills` agora — só bloco no `/dashboard`
- "Marcar pago" no MVP é só update de status. Criar transaction associada fica pra fase 2.

---

## 3. Próximos passos (ordem)

### 3.1. Verificar pré-requisito (Subscriptions mergeada)

```bash
git log --oneline -5
# Se NÃO houver commit "feat: subscriptions ..." — PARE e espere
```

Se Subscriptions já foi mergeada: `git pull origin main` e prossiga.

### 3.2. Criar schema Drizzle

Criar `packages/db/src/schema/bills.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, userIdColumn } from "./_shared";
import { categories, financialAccounts, transactions } from "./financial";

/**
 * Contas a pagar — boletos, faturas, plano de saúde, condomínio.
 * status: 'pending' | 'paid' | 'overdue' | 'cancelled'
 * Note: 'overdue' é computado em runtime (due_on < today AND status = 'pending')
 *       — não persistir overdue diretamente, deixar como pending no banco.
 */
export const bills = pgTable(
  "bills",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    vendor: text("vendor"), // canonical: "nubank", "hapvida"
    amount_cents: decimal("amount_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    due_on: date("due_on").notNull(),
    status: text("status").notNull().default("pending"),
    paid_on: date("paid_on"),
    paid_transaction_id: uuid("paid_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" }
    ),
    account_id: uuid("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    barcode: text("barcode"),
    gateway_url: text("gateway_url"),
    color: text("color"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusDueIdx: index("bills_user_status_due_idx").on(
      t.user_id,
      t.status,
      t.due_on
    ),
    userDueIdx: index("bills_user_due_idx").on(t.user_id, t.due_on),
  })
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
```

Adicionar export em `packages/db/src/schema/index.ts`:
```ts
export * from "./bills";
```

### 3.3. Gerar e aplicar migration

```bash
pnpm db:generate
pnpm db:migrate
```

### 3.4. RLS policy

Criar `packages/db/sql/0003_bills_rls.sql`:
```sql
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bills_owner_all"
  ON bills
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Aplicar:
```bash
psql "$DATABASE_URL" -f packages/db/sql/0003_bills_rls.sql
```

Validar com `check-rls.mts` que conta passou de 23 → 24 com RLS.

### 3.5. Seed inicial

Criar `packages/db/scripts/seed-bills.mts`. Exemplos realistas pra Luiz (intensivista em Recife):

```ts
const seeds = [
  {
    name: "Fatura Nubank",
    vendor: "nubank",
    amount_cents: "234000",
    due_on: addDays(today, 3),  // urgência amber
    color: "oklch(0.5 0.18 290)",
  },
  {
    name: "Plano Hapvida",
    vendor: "hapvida",
    amount_cents: "78000",
    due_on: addDays(today, 5),
    color: "oklch(0.5 0.16 25)",
  },
  {
    name: "Condomínio",
    vendor: "condominio",
    amount_cents: "120000",
    due_on: addDays(today, 12),
  },
  {
    name: "Internet Vivo",
    vendor: "vivo",
    amount_cents: "12000",
    due_on: addDays(today, 15),
  },
  // 1 overdue pra teste visual:
  {
    name: "Energia Celpe",
    vendor: "celpe",
    amount_cents: "18900",
    due_on: addDays(today, -2),  // já venceu — bate o status overdue
  },
];
```

Helper `addDays(date, n)` ou usar `date-fns` se já estiver no projeto. Senão escreva inline:
```ts
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
```

Idempotente: usar `ON CONFLICT (user_id, vendor, due_on) DO NOTHING` (precisa adicionar uniqueIndex no schema) OU checar antes de inserir. Sugestão: NÃO adicionar uniqueIndex (pode haver 2 boletos do mesmo vendor no mesmo mês), checar via `SELECT count` antes.

Rodar:
```bash
pnpm --filter @agendario/db exec tsx scripts/seed-bills.mts 90f145e7-46bf-46fb-8425-ad633e3d7535
```

### 3.6. Query em `loadDashboard`

No `apps/web/src/app/dashboard/page.tsx`, adicionar após Subscriptions:

```ts
const upcomingBills = await db
  .select({
    id: bills.id,
    name: bills.name,
    vendor: bills.vendor,
    amount_cents: bills.amount_cents,
    due_on: bills.due_on,
    status: bills.status,
    color: bills.color,
  })
  .from(bills)
  .where(
    and(
      eq(bills.user_id, userId),
      inArray(bills.status, ["pending"]),
      lt(bills.due_on, addDaysStr(20))  // próximos 20 dias + atrasados
    )
  )
  .orderBy(asc(bills.due_on))
  .limit(8);
```

Helper local pra "string YYYY-MM-DD daqui a N dias" (ou inline).

Computar status visual no JSX:
```ts
function billUrgency(dueOnStr: string): "overdue" | "soon" | "normal" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueOnStr + "T00:00:00");
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "normal";
}
```

Calcular total a pagar próximos 7d (pra mostrar no header do bloco):
```ts
const sevenDayTotal = upcomingBills.reduce((sum, b) => {
  const u = billUrgency(b.due_on);
  if (u === "overdue" || u === "soon") return sum + Number(b.amount_cents);
  return sum;
}, 0);
```

### 3.7. Renderizar bloco "A pagar" no `/dashboard`

**Posição sugerida:** após Subscriptions, antes de "Atividade recente". Mas adapte se ficar visualmente desbalanceado.

**Layout (estilo Native, copiar padrão dos outros blocos):**

```
[ Header: "A pagar" + "{n} contas · R$ X em 7 dias" ]

[avatar 36px] Fatura Nubank        R$ 2.340     amber
              vence em 3 dias                    (badge)

[avatar 36px] Plano Hapvida        R$ 780
              vence em 5 dias

[avatar 36px] Energia Celpe        R$ 189       red
              ATRASADA · venceu há 2 dias        (badge)
```

**Badge de status (lado direito ou logo abaixo do valor):**
- `overdue`: `text-red-400` + texto "atrasada · venceu há Xd"
- `soon` (≤3d): `text-amber-300` + "vence em Xd"
- `normal`: cor neutra `oklch(0.55 0.006 30)` + "vence em Xd"

**Avatar:** quadrado rounded-xl `size-9`, `background: color-mix(in oklch, ${bill.color ?? defaultColor} 18%, transparent)`. Conteúdo: primeira letra do `vendor` (uppercase) ou primeira letra do `name`.

**Action button (opcional MVP):** mostra "marcar pago" inline (text-button pequeno) que dispara server action `markBillPaid(billId)`. Implementação:
```ts
async function markBillPaid(formData: FormData) {
  "use server";
  const billId = formData.get("billId") as string;
  // ... validar user, update status='paid', paid_on=today
  revalidatePath("/dashboard");
}
```

**ATENÇÃO TRUNCATE:** nomes podem ser longos ("Plano Hapvida Premium Familiar"). `truncate min-w-0 flex-1` no parent.

**Empty state:** "Tudo em dia ✓ Nenhuma conta pendente."

### 3.8. Validar visualmente

- `pnpm dev:web` em background
- Abrir `/dashboard` autenticado
- Conferir badges de urgência (deve ter 1 amber Nubank, 1 red Celpe overdue, 2-3 normais)
- **NÃO commitar sem aprovação**

### 3.9. Commit + push como @devops

Após aprovação:
```bash
git add packages/db/src/schema/bills.ts \
        packages/db/src/schema/index.ts \
        packages/db/sql/0003_bills_rls.sql \
        packages/db/scripts/seed-bills.mts \
        apps/web/src/app/dashboard/page.tsx \
        packages/db/drizzle/

git commit -m "feat: bills tracking + dashboard block"
git push origin main
```

Mensagem completa sugerida:
```
feat: bills tracking + dashboard block

Adds bills schema with due_on/status, links optional to paid transaction,
RLS policy, seed with realistic data (Nubank, Hapvida, condomínio, etc),
dashboard query for next 20 days, and UI block with urgency badges:
red for overdue, amber for ≤3 days, neutral otherwise. Mark-as-paid
server action updates status only — transaction creation is phase 2.
```

---

## 4. Perguntas em aberto

1. **uniqueIndex (user_id, vendor, due_on)?** Sugestão: NÃO. Mesmo vendor pode ter múltiplos boletos no mesmo mês (ex: cartão com vencimentos quinzenais).
2. **Job overdue automático?** Migrar status pending→overdue no DB via cron Inngest. **Não** no MVP — calcula em runtime. Refatorar quando tiver mais de 1 lugar precisando do status.
3. **Marcar pago cria transaction?** **Não** no MVP. Só update status. Em fase 2: criar transaction stub vinculada via `paid_transaction_id`, usuário edita depois.
4. **Mostrar sub-total por conta?** Ex: "Nubank: R$ 2.340 / Itaú PF: R$ 780". **Não** no MVP, é over-engineering pra pouca info.
5. **Bills recorrentes (gera automaticamente próxima ao marcar pago)?** Não no MVP. Quando precisar, conectar com `recurrence_rules` table existente.

---

## 5. Artefatos relevantes

### Arquivos a criar
- `packages/db/src/schema/bills.ts`
- `packages/db/sql/0003_bills_rls.sql`
- `packages/db/scripts/seed-bills.mts`

### Arquivos a editar
- `packages/db/src/schema/index.ts`
- `apps/web/src/app/dashboard/page.tsx`

### Schemas referência
- `packages/db/src/schema/financial.ts` — `transactions`, `financialAccounts`, `categories`
- `packages/db/src/schema/recurrence.ts` — `recurrence_rules` (futuro)
- `packages/db/src/schema/_shared.ts` — helpers

### Comandos úteis
```bash
pnpm db:generate
pnpm db:migrate
pnpm dev:web
pnpm --filter @agendario/db exec tsx scripts/check-rls.mts  # deve mostrar 24/24
pnpm --filter @agendario/web exec tsc --noEmit
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- Validar visualmente com usuário antes de commit
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Sem over-engineering — se em dúvida sobre escopo, ESCOPO MENOR

### Armadilhas
- `due_on` é date STRING `YYYY-MM-DD`
- Computar urgency em runtime, não em SQL (pra primeira pass)
- Mona Sans já carregada — usar `style={{ fontStretch: "92%" }}` em títulos
- OKLCH inline em surfaces — copiar valores exatos dos outros blocos
- Truncate com `min-w-0 flex-1`
- `revalidatePath("/dashboard")` após server action de marcar pago

---

**Pronto pra executar APÓS Subscriptions estar mergeada.** Comece pelo passo 3.1 (verificar pré-requisito).
