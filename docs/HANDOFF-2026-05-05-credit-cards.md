# Handoff: Cartões de crédito

**Data:** 2026-05-05
**Status:** aguardando início — depende de Subscriptions + Bills + Quick Add mergeados (mesmo `dashboard/page.tsx`)
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Adicionar tracking de **cartões de crédito** ao Agendario. Cartão é uma extensão de `financial_accounts` (já existe `type='credit_card'` no enum) — não duplicar a entidade. Agregar:

1. **Limite, fechamento e vencimento** como colunas em `financial_accounts` (nullable, só preenchidas se type=credit_card)
2. **Fatura corrente** computada em runtime — SUM(amount_cents) das transactions do cartão no período (último fechamento → próximo)
3. **Parcelamentos** em tabela nova `credit_card_installments` (compra X em N parcelas)
4. **Bloco no `/dashboard`** mostrando: cartões ativos, fatura aberta, % do limite, próximo vencimento, top parcelamentos

**Por que importa:** intensivista usa cartão pra quase tudo (combustível, restaurantes, equipamentos médicos parcelados, congressos). Sem visibilidade da fatura aberta + parcelamentos, é impossível planejar fluxo.

**Escopo MVP:** 1 cartão = ok. Múltiplos = ok (toggle entre cartões via pill tabs no header do bloco). Faturas históricas (PDF da fatura passada) **fora do escopo** — fica pra fase 2.

---

## 2. Contexto essencial

### Pré-requisitos
- Subscriptions, Bills, Quick Add **todos mergeados**
- `git pull origin main`
- O dashboard provavelmente já está com 5+ blocos. Considere se faz sentido **extrair sub-componentes** (`apps/web/src/app/dashboard/_components/`) antes de adicionar mais um. Decisão fica com você + usuário — não over-engineer se não fizer sentido AINDA.

### Stack relevante
- `account_type` enum em `packages/db/src/schema/_shared.ts` deve já incluir `credit_card` — confirmar antes de qualquer coisa.
- `financial_accounts` já existe — colunas a ADICIONAR via ALTER TABLE
- `transactions.account_id` aponta pra `financial_accounts` — saldo de cartão = SUM(amount_cents) das transactions com `account_id = cartão` (sinal: expense é negativo, então fatura é -SUM ou ABS)

### Padrões obrigatórios
- snake_case columns
- Nullable nas colunas novas (cards são minoria das contas)
- RLS já existe em `financial_accounts` — adicionar em `credit_card_installments`
- Estilo Native: copiar padrão dos outros blocos do `/dashboard`
- Drizzle direct + filtro user_id

### Restrições
- **NÃO criar uma tabela `credit_cards` paralela** — extender `financial_accounts`
- **NÃO** persistir faturas no banco (computar em runtime)
- **NÃO** implementar pagamento de fatura (gateway integration etc) — fica pra fase 3
- **NÃO** criar `/financas/cartoes` agora — só bloco no `/dashboard`

---

## 3. Próximos passos (ordem)

### 3.1. Verificar pré-requisitos

```bash
git log --oneline -10
git pull origin main

# Confirmar enum account_type
grep -n "account_type\|credit_card" packages/db/src/schema/_shared.ts
```

Esperado: `accountTypeEnum` contém valor `credit_card`. Se NÃO tiver, adicionar antes de prosseguir (ALTER TYPE … ADD VALUE).

### 3.2. ALTER TABLE em `financial_accounts`

Editar `packages/db/src/schema/financial.ts`, na definição de `financialAccounts`, adicionar 3 colunas nullable:

```ts
// dentro de pgTable("financial_accounts", { ... })
cc_closing_day: smallint("cc_closing_day"),  // 1-31, dia do fechamento
cc_due_day: smallint("cc_due_day"),          // 1-31, dia do vencimento
cc_limit_cents: decimal("cc_limit_cents", { precision: 14, scale: 0 }),
```

Importar `smallint` de `drizzle-orm/pg-core`.

```bash
pnpm db:generate   # vai gerar ALTER TABLE
pnpm db:migrate
```

### 3.3. Schema novo: `credit_card_installments`

Criar `packages/db/src/schema/credit-cards.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, userIdColumn } from "./_shared";
import { categories, financialAccounts } from "./financial";

/**
 * Parcelamentos ativos no cartão de crédito.
 * Cada compra parcelada gera 1 row aqui + N transactions (uma por parcela).
 * total_cents = preço total da compra
 * installment_cents = valor de cada parcela (precision: 2 casas via cents)
 */
export const creditCardInstallments = pgTable(
  "credit_card_installments",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    vendor: text("vendor"),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    total_cents: decimal("total_cents", { precision: 14, scale: 0 }).notNull(),
    installment_count: integer("installment_count").notNull(),
    installment_cents: decimal("installment_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    first_charge_on: date("first_charge_on").notNull(),
    // Quantas parcelas já foram cobradas (computar via transactions seria melhor,
    // mas um contador denormalizado simplifica queries no dashboard)
    paid_installments: integer("paid_installments").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userAccountIdx: index("cc_installments_user_account_idx").on(
      t.user_id,
      t.account_id
    ),
  })
);

export type CreditCardInstallment = typeof creditCardInstallments.$inferSelect;
export type NewCreditCardInstallment =
  typeof creditCardInstallments.$inferInsert;
```

Adicionar export em `packages/db/src/schema/index.ts`:
```ts
export * from "./credit-cards";
```

```bash
pnpm db:generate
pnpm db:migrate
```

### 3.4. RLS policy

Criar `packages/db/sql/0004_credit_card_installments_rls.sql`:
```sql
ALTER TABLE credit_card_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_installments_owner_all"
  ON credit_card_installments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

`financial_accounts` já tem RLS — não precisa repetir.

Validar com `check-rls.mts` que conta passou pra 25 ou mais (depende de quantas tabelas Subs+Bills adicionaram).

### 3.5. Seed inicial

Criar `packages/db/scripts/seed-credit-cards.mts`:
- Args: `<USER_ID>`
- Atualiza conta existente (se houver Nubank) ou cria nova `financial_account` com type=credit_card
- Adiciona 2-3 parcelamentos realistas pro Luiz

Exemplo:
```ts
// 1. Se já existe conta "Nubank", UPDATE; senão INSERT
const card = {
  name: "Nubank Roxinho",
  type: "credit_card",
  institution: "Nubank",
  cc_closing_day: 28,
  cc_due_day: 8,
  cc_limit_cents: "800000",  // R$ 8.000
  color: "oklch(0.5 0.18 290)",
};

// 2. Parcelamentos
const installments = [
  {
    description: "Macbook Pro M4",
    vendor: "apple",
    total_cents: "1069200",  // R$ 10.692
    installment_count: 12,
    installment_cents: "89100",  // R$ 891
    first_charge_on: "2026-02-08",
    paid_installments: 3,  // 3/12 já cobradas
  },
  {
    description: "Estetoscópio Littmann",
    vendor: "littmann",
    total_cents: "144000",  // R$ 1.440
    installment_count: 3,
    installment_cents: "48000",  // R$ 480
    first_charge_on: "2026-04-08",
    paid_installments: 1,
  },
  {
    description: "Curso UTI Avançada",
    vendor: "instituto",
    total_cents: "192000",
    installment_count: 6,
    installment_cents: "32000",
    first_charge_on: "2026-03-08",
    paid_installments: 2,
  },
];
```

Idempotente: checar antes de inserir (ou ON CONFLICT). Sugestão: NÃO uniqueIndex, checar via `WHERE description = ? AND user_id = ?` antes.

### 3.6. Query em `loadDashboard`

No `dashboard/page.tsx`:

```ts
// Cartões + fatura aberta computada
const cardsRaw = await db
  .select({
    id: financialAccounts.id,
    name: financialAccounts.name,
    institution: financialAccounts.institution,
    color: financialAccounts.color,
    cc_closing_day: financialAccounts.cc_closing_day,
    cc_due_day: financialAccounts.cc_due_day,
    cc_limit_cents: financialAccounts.cc_limit_cents,
  })
  .from(financialAccounts)
  .where(
    and(
      eq(financialAccounts.user_id, userId),
      eq(financialAccounts.type, "credit_card"),
      eq(financialAccounts.is_archived, false)
    )
  )
  .orderBy(asc(financialAccounts.name));

// Pra cada cartão, calcular janela do ciclo atual
function currentCycle(closingDay: number) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = today.getDate();
  // Se hoje >= closingDay, ciclo: [this_month closingDay+1, next_month closingDay]
  // Se hoje < closingDay, ciclo: [last_month closingDay+1, this_month closingDay]
  const start =
    day > closingDay
      ? new Date(y, m, closingDay + 1)
      : new Date(y, m - 1, closingDay + 1);
  const end =
    day > closingDay
      ? new Date(y, m + 1, closingDay)
      : new Date(y, m, closingDay);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startStr: fmt(start), endStr: fmt(end) };
}

// Buscar SUM por cartão do ciclo atual
// (1 query por cartão pra simplicidade. Otimizar pra 1 query agregada se virar gargalo.)
const cards = await Promise.all(
  cardsRaw.map(async (c) => {
    let openInvoiceCents = 0;
    if (c.cc_closing_day) {
      const { startStr, endStr } = currentCycle(c.cc_closing_day);
      const result = await db
        .select({
          total: sql<string>`COALESCE(SUM(ABS(${transactions.amount_cents})), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.user_id, userId),
            eq(transactions.account_id, c.id),
            eq(transactions.type, "expense"),
            gte(transactions.occurred_on, startStr),
            lt(transactions.occurred_on, endStr)
          )
        );
      openInvoiceCents = Number(result[0]?.total ?? 0);
    }
    return { ...c, openInvoiceCents };
  })
);

// Top parcelamentos ativos (paid_installments < installment_count)
const activeInstallments = await db
  .select({
    id: creditCardInstallments.id,
    description: creditCardInstallments.description,
    installment_count: creditCardInstallments.installment_count,
    paid_installments: creditCardInstallments.paid_installments,
    installment_cents: creditCardInstallments.installment_cents,
    account_id: creditCardInstallments.account_id,
  })
  .from(creditCardInstallments)
  .where(
    and(
      eq(creditCardInstallments.user_id, userId),
      lt(
        creditCardInstallments.paid_installments,
        creditCardInstallments.installment_count
      )
    )
  )
  .orderBy(desc(creditCardInstallments.installment_cents))
  .limit(5);
```

### 3.7. Renderizar bloco "Cartões"

**Posição sugerida:** após "Onde foi" (top categorias), antes de "Atividade recente". Mas adapte conforme balanceamento visual.

**Empty state se nenhum cartão configurado:** "Nenhum cartão configurado. Vá em Configurações → Contas pra adicionar."

**Layout single-card (caso 1 cartão):**

```
NUBANK ROXINHO                                  [Nubank]
Fatura aberta R$ 2.340 / R$ 8.000
████████░░░░░░░░░░░░░░░░░░░░░░  29% do limite
Fecha 28 mai · Vence 08 jun

3 parcelamentos ativos
  Macbook Pro M4         3/12   R$ 891/mês
  Curso UTI              2/6    R$ 320/mês
  Estetoscópio           1/3    R$ 480/mês
```

**Layout multi-card (caso 2+ cartões):** pill tabs no topo do bloco com `[Nubank] [Latam]`, conteúdo troca conforme tab. Implementação client-side com `useState` (pode virar componente client `<CardsBlock />` se ficar muito JSX inline).

**Cores:**
- Barra de progresso: `oklch(0.85 0.16 80)` (amber suave) sempre, gradient pra `oklch(0.78 0.16 25)` (red) quando >= 80%
- Background do card: `cc.color` com 20% mix em surface — ou usar surface padrão se preferir consistência

**Detalhe — vencimento:**
```ts
function dueLabel(dueDay: number): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = today.getDate();
  // Se hoje passou o due_day, próximo vencimento é mês que vem
  const due = day > dueDay
    ? new Date(y, m + 1, dueDay)
    : new Date(y, m, dueDay);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(due);
}
```

**Atenção truncate:** `description` de parcelamento ("Macbook Pro M4 14-inch Space Black 1TB") pode ser longo. `truncate min-w-0 flex-1` no parent.

### 3.8. (Opcional) Considerar refactor em sub-componentes

Após este bloco, `dashboard/page.tsx` deve passar de 700 linhas. Avaliar com usuário se é hora de extrair:
- `_components/HeroCard.tsx`
- `_components/SubscriptionsBlock.tsx`
- `_components/BillsBlock.tsx`
- `_components/CardsBlock.tsx`
- `_components/CategoriesBlock.tsx`
- `_components/RecentActivityBlock.tsx`
- `_components/ShiftsBlock.tsx`

**NÃO refatore por iniciativa** — só sugira ao usuário se fizer sentido. Se ele aprovar, fazer em commit separado **antes** ou **depois** desta feature, nunca misturado.

### 3.9. Validar visualmente + funcionalmente

- `pnpm dev:web`
- `/dashboard` autenticado com seed aplicado
- Conferir:
  - Card mostra fatura aberta = SUM das transactions do ciclo
  - Limite % barra está correta
  - Fechamento/vencimento corretos (08 jun com hoje 5 mai? sim, dueDay=8, dia atual 5, próximo é mai 8)
  - Parcelamentos com X/N corretos
  - Truncate em descrições longas
- **NÃO commitar sem aprovação**

### 3.10. Commit + push como @devops

Após aprovação:
```bash
git add packages/db/src/schema/financial.ts \
        packages/db/src/schema/credit-cards.ts \
        packages/db/src/schema/index.ts \
        packages/db/sql/0004_credit_card_installments_rls.sql \
        packages/db/scripts/seed-credit-cards.mts \
        apps/web/src/app/dashboard/page.tsx \
        packages/db/drizzle/

git commit -m "feat: credit card tracking + dashboard block"
git push origin main
```

Mensagem completa:
```
feat: credit card tracking + dashboard block

Extends financial_accounts with cc_closing_day/cc_due_day/cc_limit_cents
nullable columns (only filled when type='credit_card'), adds new
credit_card_installments table for active installment tracking, and
introduces a dashboard block computing the open invoice in runtime
(SUM of transactions in current cycle), limit usage %, next due date,
and top installments per card.

Multi-card support via pill tabs. Invoice persistence and gateway
payment are out of scope (phase 2/3).
```

---

## 4. Perguntas em aberto

1. **Por que NÃO uma tabela `credit_cards` paralela?** `financial_accounts` já tem `type='credit_card'` no enum. Duplicar entidade quebra invariant que toda transaction aponta pra UMA `account_id`. Sempre fugir de "cartão != conta" — cartão É conta de tipo diferente.
2. **Por que computar fatura em runtime e não persistir?** Pra MVP, simplicidade > performance. Ciclo atual = 1 query agregada barata. Se virar gargalo, materializar em `credit_card_invoices` table com cron Inngest pra recalcular.
3. **`paid_installments` denormalizado?** Sim, pra simplificar a query do dashboard. Trade-off: precisa atualizar quando parcela é cobrada (via Inngest function `transactions/created` que detecte parcelamento e incremente). Pra MVP **manual via seed**. Em fase 2: function automática.
4. **Como vincular transaction → installment?** Adicionar `installment_id` em `transactions` (nullable, references credit_card_installments). **NÃO no MVP** — pode ser inferido por description matching se necessário. Adicionar coluna em fase 2.
5. **Pagamento da fatura cria transaction?** Mesma resposta de Bills: status update no MVP, criar transaction associada em fase 2.

---

## 5. Artefatos relevantes

### Arquivos a criar
- `packages/db/src/schema/credit-cards.ts` (table credit_card_installments)
- `packages/db/sql/0004_credit_card_installments_rls.sql`
- `packages/db/scripts/seed-credit-cards.mts`

### Arquivos a editar
- `packages/db/src/schema/financial.ts` — ADD 3 colunas em financialAccounts
- `packages/db/src/schema/index.ts` — export
- `apps/web/src/app/dashboard/page.tsx` — query + bloco

### Schemas referência
- `packages/db/src/schema/_shared.ts` — confirmar `accountTypeEnum` inclui `credit_card`
- `packages/db/src/schema/financial.ts` — `financialAccounts`, `transactions`, `categories`

### Comandos úteis
```bash
pnpm db:generate
pnpm db:migrate
pnpm dev:web
pnpm --filter @agendario/db exec tsx scripts/check-rls.mts
pnpm --filter @agendario/web exec tsc --noEmit
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- Validar visualmente E funcionalmente (números da fatura batem com transactions reais?)
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Se em dúvida sobre escopo: ESCOPO MENOR. Use multi-card simples antes de adornos.

### Armadilhas
- `cc_closing_day` e `cc_due_day` são `smallint` (1-31) — validar range
- `transactions.amount_cents` é STRING decimal com sinal — pra fatura usar `ABS()` no SQL
- Ciclos cruzam mês — testar caso de borda (hoje = closing_day, hoje = due_day)
- Múltiplos cartões: usar `useState` em client component pra não pôr todo state no server
- Mona Sans + tabular-nums em valores monetários
- Truncate com `min-w-0 flex-1` em descrições de parcelamentos
- OKLCH inline em surfaces — copiar dos outros blocos
- Se `accountTypeEnum` não incluir `credit_card`: `ALTER TYPE account_type ADD VALUE 'credit_card'` (precisa estar fora de transaction)

---

**Pronto pra executar APÓS Subscriptions + Bills + Quick Add mergeados.** Comece por 3.1. Avise via Maestri se accountTypeEnum não tiver `credit_card` (eu provavelmente errei o palpite).
