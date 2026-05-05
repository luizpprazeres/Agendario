# Handoff: Despesas favoritas (templates 1-clique)

**Data:** 2026-05-05
**Status:** aguardando início — independente do dashboard work, mas idealmente após Quick Add (UX integrada)
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Permitir que o Luiz **crie transações com 1 clique** a partir de padrões frequentes ("Combustível R$ 300 Shell", "Almoço hospital R$ 50", "Café R$ 12"). Lança chip no `/dashboard` que dispara server action criando a transaction com todos os defaults preenchidos (conta, categoria, descrição, valor).

**Por que importa:** o intensivista repete os mesmos gastos várias vezes por semana. Capturar via Telegram funciona, mas pra padrões 100% repetitivos (mesmo posto, mesmo restaurante hospital, mesmo café), 1 clique > digitar 30s no bot.

**Escopo MVP:**
- Schema `expense_templates` novo
- Migration + RLS
- Seed inicial com 5-6 templates realistas pra Luiz
- Query no `/dashboard`: top 6 por `usage_count` desc
- Chips no dashboard (logo após Quick Add se já mergeado, senão após hero card)
- Server action `applyTemplate(templateId)` → cria transaction + increment usage_count + dispatch categorize
- Aparece toast inline OU revalidação faz a transaction nova surgir em "Atividade recente"

**Fora de escopo (fase 2):**
- Página `/favoritos` pra criar/editar/arquivar via UI (no MVP é seed-only)
- Long-press pra editar template inline
- Income templates ("Plantão pago Real R$ 1.700") — viável tecnicamente mas income é menos repetitivo
- Templates condicionais (varia preço por dia da semana etc)

---

## 2. Contexto essencial

### Já existe
- Schema base de transactions, categories, financialAccounts (em `packages/db/src/schema/financial.ts`)
- Padrão de `applyAliases`/`categorize-transaction` Inngest function — reusar dispatch
- Padrão de bloco no dashboard (estilo Native, rounded-3xl, oklch warm)

### Pré-requisitos
- Subscriptions, Bills mergeadas (em main no momento que escrevo)
- **Idealmente após Quick Add mergeado** — chips ficam visualmente abaixo do input. Se Quick Add não foi feito ainda, posicione no topo do dashboard mesmo (acima do hero card)
- `git pull origin main` antes de começar

### Padrões obrigatórios
- `amount_cents` decimal STRING signed (negativo expense, positivo income)
- snake_case columns, `metadata jsonb default '{}'`, timestamps padrão
- RLS policy permissiva owner-only
- Estilo Native — copiar padrão dos outros blocos (rounded-3xl, oklch warm, tabular-nums em valores)
- Português UI, sem emojis em código (mas `template.icon` aceita emoji do banco)

### Restrições
- **NÃO** criar `/favoritos` page no MVP — só leitura no dashboard
- **NÃO** commitar sem aprovação visual do user
- **NÃO** transformar isso num CRUD completo — escopo enxuto

---

## 3. Próximos passos (ordem)

### 3.1. Verificar pré-requisitos

```bash
git pull origin main
# Confirmar que Subscriptions, Bills (e idealmente Quick Add) estão mergeados
git log --oneline -10
```

### 3.2. Schema novo

Criar `packages/db/src/schema/expense-templates.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, transactionTypeEnum, userIdColumn } from "./_shared";
import { categories, financialAccounts } from "./financial";
import { workplaces } from "./workplaces";

/**
 * Templates de transação 1-clique ("favoritos").
 *
 * Aplicado via server action: cria transaction com os defaults preenchidos,
 * incrementa usage_count e last_used_at. Disparar `transactions/categorize-requested`
 * apenas se template.default_category_id for null.
 */
export const expenseTemplates = pgTable(
  "expense_templates",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    // Label visível (ex: "Combustível Shell"). Ícone separado no `icon`.
    name: text("name").notNull(),
    icon: text("icon"),  // emoji ou null
    color: text("color"),
    // Descrição que vai ser usada na transaction criada (ex: "Posto Shell · Caxangá")
    description_template: text("description_template").notNull(),
    type: transactionTypeEnum("type").notNull().default("expense"),
    // SEMPRE positivo aqui — sinal é aplicado no server action conforme type
    default_amount_cents: decimal("default_amount_cents", {
      precision: 14,
      scale: 0,
    }).notNull(),
    default_account_id: uuid("default_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" }
    ),
    default_category_id: uuid("default_category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),
    default_workplace_id: uuid("default_workplace_id").references(
      () => workplaces.id,
      { onDelete: "set null" }
    ),
    notes: text("notes"),
    sort_order: integer("sort_order").notNull().default(0),
    usage_count: integer("usage_count").notNull().default(0),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    is_archived: boolean("is_archived").notNull().default(false),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userActiveIdx: index("templates_user_active_idx").on(
      t.user_id,
      t.is_archived
    ),
    userUsageIdx: index("templates_user_usage_idx").on(
      t.user_id,
      t.usage_count
    ),
  })
);

export type ExpenseTemplate = typeof expenseTemplates.$inferSelect;
export type NewExpenseTemplate = typeof expenseTemplates.$inferInsert;
```

Adicionar export em `packages/db/src/schema/index.ts`:
```ts
export * from "./expense-templates";
```

### 3.3. Migration

```bash
pnpm db:generate
pnpm db:migrate
```

### 3.4. RLS policy

Criar `packages/db/sql/00XX_expense_templates_rls.sql` (numerar conforme próxima migration):

```sql
ALTER TABLE expense_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_templates_owner_all"
  ON expense_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

```bash
psql "$DATABASE_URL" -f packages/db/sql/00XX_expense_templates_rls.sql
```

Validar com `check-rls.mts` que conta subiu.

### 3.5. Seed inicial

Criar `packages/db/scripts/seed-expense-templates.mts`:
- Args: `<USER_ID>`
- Carrega `default_account_id` (primeira conta ativa) e `default_category_id` por slug (`combustivel`, `alimentacao-restaurantes`, `alimentacao-mercado`, etc)
- Idempotente (checar antes de inserir via `WHERE name = ? AND user_id = ?`)

Sugestão de templates (ajustar a gostos do Luiz):
```ts
const seeds = [
  {
    name: "Combustível Shell",
    icon: "⛽",
    description_template: "Posto Shell · Caxangá",
    default_amount_cents: "30000",  // R$ 300
    category_slug: "combustivel",
  },
  {
    name: "Almoço hospital",
    icon: "🍽️",
    description_template: "Almoço · cantina hospital",
    default_amount_cents: "5000",  // R$ 50
    category_slug: "alimentacao-restaurantes",
  },
  {
    name: "Café Café Café",
    icon: "☕",
    description_template: "Café Café Café",
    default_amount_cents: "1200",  // R$ 12
    category_slug: "alimentacao-restaurantes",
  },
  {
    name: "Mercado",
    icon: "🛒",
    description_template: "Mercado",
    default_amount_cents: "40000",  // R$ 400
    category_slug: "alimentacao-mercado",
  },
  {
    name: "iFood",
    icon: "🛵",
    description_template: "iFood · delivery",
    default_amount_cents: "6000",  // R$ 60
    category_slug: "alimentacao-delivery",
  },
];
```

Rodar:
```bash
pnpm --filter @agendario/db exec tsx scripts/seed-expense-templates.mts 90f145e7-46bf-46fb-8425-ad633e3d7535
```

### 3.6. Query em `loadDashboard`

No `apps/web/src/app/dashboard/page.tsx`:

```ts
const favoriteTemplates = await db
  .select({
    id: expenseTemplates.id,
    name: expenseTemplates.name,
    icon: expenseTemplates.icon,
    color: expenseTemplates.color,
    type: expenseTemplates.type,
    default_amount_cents: expenseTemplates.default_amount_cents,
  })
  .from(expenseTemplates)
  .where(
    and(
      eq(expenseTemplates.user_id, userId),
      eq(expenseTemplates.is_archived, false)
    )
  )
  .orderBy(
    desc(expenseTemplates.usage_count),
    asc(expenseTemplates.sort_order),
    asc(expenseTemplates.name)
  )
  .limit(6);
```

Retornar no objeto:
```ts
return { ..., favoriteTemplates };
```

### 3.7. Server action `applyTemplate`

```ts
async function applyTemplate(formData: FormData) {
  "use server";

  const templateId = String(formData.get("template_id") ?? "");
  if (!templateId) return;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDb();

  const [tpl] = await db
    .select()
    .from(expenseTemplates)
    .where(
      and(
        eq(expenseTemplates.id, templateId),
        eq(expenseTemplates.user_id, user.id),
        eq(expenseTemplates.is_archived, false)
      )
    )
    .limit(1);

  if (!tpl) return;

  // Resolver account: usa default_account_id, ou primeira conta ativa do user
  let accountId = tpl.default_account_id;
  if (!accountId) {
    const [acc] = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.user_id, user.id),
          eq(financialAccounts.is_archived, false)
        )
      )
      .limit(1);
    accountId = acc?.id ?? null;
  }
  if (!accountId) return;  // sem conta, não dá pra criar

  // Aplica sinal conforme type
  const baseAmount = Number(tpl.default_amount_cents);
  const signedAmount =
    tpl.type === "expense" ? -Math.abs(baseAmount) : Math.abs(baseAmount);

  // Data atual em America/Recife (YYYY-MM-DD)
  const occurredOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [created] = await db
    .insert(transactions)
    .values({
      user_id: user.id,
      account_id: accountId,
      category_id: tpl.default_category_id,
      workplace_id: tpl.default_workplace_id,
      type: tpl.type,
      amount_cents: signedAmount.toString(),
      description: tpl.description_template,
      occurred_on: occurredOn,
      source: "template",
      external_id: `tpl:${tpl.id}:${Date.now()}`,
      notes: tpl.notes,
    })
    .returning({ id: transactions.id });

  if (!created) return;

  // Bump usage stats
  await db
    .update(expenseTemplates)
    .set({
      usage_count: sql`${expenseTemplates.usage_count} + 1`,
      last_used_at: new Date(),
    })
    .where(eq(expenseTemplates.id, tpl.id));

  // Categorize via LLM se template não tinha categoria pré-definida
  if (!tpl.default_category_id) {
    await inngest.send({
      name: "transactions/categorize-requested",
      data: { transaction_id: created.id },
    });
  }

  revalidatePath("/dashboard");
}
```

Imports necessários:
```ts
import { revalidatePath } from "next/cache";
import { expenseTemplates } from "@agendario/db";
// `sql` já importado
```

### 3.8. Renderizar bloco "Favoritos"

**Posição sugerida:**
- Se Quick Add mergeado: logo após o input do Quick Add (chips visualmente "abaixo" do input)
- Se Quick Add não mergeado: após hero card "Saldo total"

**Layout:** chips horizontais, scroll horizontal em mobile, wrap em desktop.

```tsx
{favoriteTemplates.length > 0 ? (
  <section className="px-4 sm:px-6">
    <p
      className="font-mono text-[10px] uppercase tracking-wider mb-2"
      style={{ color: "oklch(0.55 0.006 30)" }}
    >
      Favoritos
    </p>
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
      {favoriteTemplates.map((tpl) => {
        const cents = Number(tpl.default_amount_cents);
        const isExpense = tpl.type === "expense";
        const swatch = tpl.color ?? "oklch(0.5 0.05 250)";
        return (
          <form key={tpl.id} action={applyTemplate} className="shrink-0">
            <input type="hidden" name="template_id" value={tpl.id} />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition hover:border-zinc-700"
              style={{
                background: `color-mix(in oklch, ${swatch} 8%, oklch(0.21 0.007 30))`,
                borderColor: "oklch(0.28 0.008 30)",
              }}
            >
              {tpl.icon ? <span className="text-base">{tpl.icon}</span> : null}
              <span className="text-zinc-100">{tpl.name}</span>
              <span
                className={`tabular-nums font-medium ${
                  isExpense ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {isExpense ? "− " : "+ "}
                {BRL.format(cents / 100)}
              </span>
            </button>
          </form>
        );
      })}
    </div>
  </section>
) : null}
```

**ATENÇÃO TRUNCATE:** nomes podem ser longos ("Combustível Shell Caxangá Premium"). Em mobile com `overflow-x-auto`, OK — chips podem extrapolar largura. Em desktop com `flex-wrap`, OK também. Evite `truncate` que cortaria informação.

### 3.9. Validar visualmente

- `pnpm dev:web`
- Abrir `/dashboard` autenticado
- Verificar:
  - Chips aparecem na ordem certa (top usage_count primeiro, depois alfabético)
  - Click no chip cria transaction (aparece em "Atividade recente" após refresh)
  - Valor formatado em BRL
  - Sinal correto (vermelho expense, verde income)
  - Mobile: scroll horizontal funciona
  - Categorização automática roda se template não tem `default_category_id`

### 3.10. Commit + push como @devops

Após aprovação:
```bash
git add packages/db/src/schema/expense-templates.ts \
        packages/db/src/schema/index.ts \
        packages/db/sql/00XX_expense_templates_rls.sql \
        packages/db/scripts/seed-expense-templates.mts \
        apps/web/src/app/dashboard/page.tsx \
        packages/db/drizzle/

git commit -m "feat: expense templates (1-click favorites) on /dashboard"
git push origin main
```

Mensagem completa sugerida:
```
feat: expense templates (1-click favorites) on /dashboard

Adds expense_templates schema with default amount/category/account,
RLS policy, seed with 5 realistic templates (combustível, almoço,
café, mercado, ifood), and a horizontal chip strip on /dashboard
that creates a transaction in 1 click via server action.

applyTemplate increments usage_count and last_used_at, dispatches
categorize-requested only if template lacked a default category.
Top 6 chips ordered by usage_count desc + sort_order asc.

Edit/create UI is out of scope (seed-only at MVP). Phase 2 adds
/favoritos page for full CRUD.
```

---

## 4. Perguntas em aberto

1. **Income templates?** Schema suporta (`type: 'income'`), mas seed inicial é só expense porque income é menos repetitivo. Adicionar 1-2 manualmente via SQL se demandado.
2. **Reset de usage_count?** Não no MVP. Em fase 2, considerar decay (diminuir 1 por mês não usado) pra ranking favorecer atual.
3. **Atalho keyboard?** Tipo "1-9 → aplica template N"? Não no MVP. Pode ser feito via Command Palette (futuro).
4. **Edição inline (long-press / right-click)?** Não no MVP. Edita via SQL ou via /favoritos page (fase 2).
5. **Limite de chips visíveis?** 6 no MVP. Pode virar configurável via preferences.

---

## 5. Artefatos relevantes

### Arquivos a criar
- `packages/db/src/schema/expense-templates.ts`
- `packages/db/sql/00XX_expense_templates_rls.sql`
- `packages/db/scripts/seed-expense-templates.mts`

### Arquivos a editar
- `packages/db/src/schema/index.ts`
- `apps/web/src/app/dashboard/page.tsx` (query + server action + bloco)

### Schemas referência
- `packages/db/src/schema/financial.ts` — `transactions`, `financialAccounts`, `categories`
- `packages/db/src/schema/_shared.ts` — `transactionTypeEnum`

### Comandos úteis
```bash
pnpm db:generate
pnpm db:migrate
pnpm dev:web
pnpm --filter @agendario/db exec tsx scripts/check-rls.mts
pnpm --filter @agendario/web exec tsc --noEmit
```

### Helpers Drizzle adicionais (se faltar imports no page.tsx)
```ts
import { revalidatePath } from "next/cache";
import { expenseTemplates } from "@agendario/db";
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- Validar visualmente antes de commit
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Sem over-engineering — escopo enxuto, MVP rápido

### Armadilhas
- `default_amount_cents` é STRING decimal — sempre `Number()` ao usar; converter de volta com `.toString()` ao salvar
- Template guarda valor SEMPRE positivo; sinal é aplicado em runtime baseado em `type`
- `occurred_on` é date STRING `YYYY-MM-DD` — usar `Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" })` pra evitar problema de TZ
- `revalidatePath("/dashboard")` é OBRIGATÓRIO — sem ele, o usage_count atualizado não reflete na UI
- `external_id: \`tpl:${tpl.id}:${Date.now()}\`` previne dedupe quando user clica 2x em sequência
- Se template não tem `default_category_id`, dispatch `transactions/categorize-requested` (mesmo padrão do bot Telegram). Se TEM categoria, NÃO dispatch — categoria já está correta
- Chips com mobile overflow-x-auto: cuidado com `padding` no container pai — o chip pode ser cortado nas bordas. Adicionar `-mx-1 px-1` no scroller (já está no exemplo)
- Hover state em mobile não aplica — não usar `hover:` como única afford de "clicável"

---

**Pronto pra executar.** Comece por 3.1 (pull). Single-feature enxuta, ~150-200 linhas adicionadas no `dashboard/page.tsx` + 3 arquivos novos. Estimativa: 1 sessão.
