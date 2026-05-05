# Handoff: Subscriptions (assinaturas)

**Data:** 2026-05-05
**Status:** aguardando início — escopo fechado
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Adicionar uma feature de **Subscriptions** ao Agendario: schema novo, migration, seed inicial, e bloco no `/dashboard` (estilo Native, já aplicado) mostrando assinaturas ativas com total mensal e próxima cobrança. Captura via Telegram fica pra fase 2 — esta entrega é só schema + leitura.

Esta é a primeira de várias features que adicionam "entidade nova" ao app — o padrão definido aqui (schema → migration → seed → query → UI block) será replicado em **bills**, **expense_templates**, **credit cards** etc.

---

## 2. Contexto essencial

### Stack já configurada
- Drizzle ORM 0.36.4 + drizzle-kit 0.28.1
- Schema folder: `packages/db/src/schema/`
- Migration folder: `packages/db/drizzle/`
- Comandos: `pnpm db:generate`, `pnpm db:migrate`
- RLS aplicado em todas as 22 tabelas (`packages/db/sql/0001_rls_policies.sql`)
- Schema shared helpers: `packages/db/src/schema/_shared.ts` (idColumn, userIdColumn, timestampsColumns, enums)

### Padrões obrigatórios
- **Brand:** seguir CONVENÇÕES do schema atual (snake_case columns, `..._cents` em decimal STRING, `metadata jsonb default '{}'`, timestamps padrão)
- **RLS:** TODA tabela nova precisa de policy permissiva no padrão das existentes (consultar `0001_rls_policies.sql` pra modelo)
- **Estilo Native:** UI já aplicado em `/dashboard` — copiar padrão dos outros blocos (rounded-3xl, oklch warm, tabular-nums, font-stretch 90-92% em títulos)
- **Português UI**, **sem emojis em código**
- **Drizzle direct + filtro manual user_id** (TODO de RLS já documentado no page.tsx)

### Restrições
- **NÃO commitar** sem aprovação do usuário primeiro (ele valida visualmente)
- **NÃO** adicionar libs novas (charts, headlessui, etc)
- **NÃO** criar página dedicada `/financas/subscriptions` agora — só o bloco no `/dashboard`

---

## 3. Próximos passos (ordem)

### 3.1. Criar schema Drizzle

Criar `packages/db/src/schema/subscriptions.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { idColumn, timestampsColumns, userIdColumn } from "./_shared";
import { financialAccounts, categories } from "./financial";

/**
 * Assinaturas recorrentes (Spotify, Netflix, software, planos).
 * billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
 * status: 'active' | 'paused' | 'cancelled'
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn(),
    user_id: userIdColumn(),
    name: text("name").notNull(),
    // Vendor canônico para deduplicação (ex: "spotify", "netflix")
    vendor: text("vendor"),
    amount_cents: decimal("amount_cents", { precision: 14, scale: 0 }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    billing_cycle: text("billing_cycle").notNull().default("monthly"),
    next_charge_on: date("next_charge_on"),
    started_on: date("started_on"),
    cancelled_on: date("cancelled_on"),
    status: text("status").notNull().default("active"),
    account_id: uuid("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    color: text("color"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestampsColumns(),
  },
  (t) => ({
    userStatusIdx: index("subs_user_status_idx").on(t.user_id, t.status),
    userNextChargeIdx: index("subs_user_next_charge_idx").on(
      t.user_id,
      t.next_charge_on
    ),
  })
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
```

Adicionar export em `packages/db/src/schema/index.ts`:
```ts
export * from "./subscriptions";
```

### 3.2. Gerar e aplicar migration

```bash
pnpm db:generate    # gera SQL em packages/db/drizzle/
pnpm db:migrate     # aplica na Supabase Cloud
```

### 3.3. RLS policy

Criar arquivo `packages/db/sql/0002_subscriptions_rls.sql`:
```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_owner_all"
  ON subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Aplicar via psql (DATABASE_URL no .env.local):
```bash
psql "$DATABASE_URL" -f packages/db/sql/0002_subscriptions_rls.sql
```

Validar com `packages/db/scripts/check-rls.mts` que conta passou de 22 → 23 tabelas com RLS.

### 3.4. Seed inicial (opcional mas útil)

Criar `packages/db/scripts/seed-subscriptions.mts`:
- Args: `<USER_ID>`
- Insere 4-5 assinaturas reais de exemplo (Spotify, Netflix, iCloud, Notion AI, GitHub Copilot)
- Idempotente via `ON CONFLICT (user_id, vendor) DO NOTHING` (precisa adicionar `uniqueIndex` no schema se for usar — alternativa: checar antes de inserir)
- Sugestão de exemplo:
  ```ts
  const seeds = [
    { name: "Spotify Family", vendor: "spotify", amount_cents: "3500", next_charge_on: "2026-05-12", color: "oklch(0.85 0.16 155)" },
    { name: "Netflix Premium", vendor: "netflix", amount_cents: "6500", next_charge_on: "2026-05-18", color: "oklch(0.74 0.16 25)" },
    { name: "iCloud 200GB", vendor: "icloud", amount_cents: "1200", next_charge_on: "2026-05-22" },
    { name: "Notion AI", vendor: "notion", amount_cents: "7500", next_charge_on: "2026-05-28" },
  ];
  ```

Rodar com:
```bash
pnpm --filter @agendario/db exec tsx scripts/seed-subscriptions.mts 90f145e7-46bf-46fb-8425-ad633e3d7535
```

### 3.5. Adicionar query em `loadDashboard`

No `apps/web/src/app/dashboard/page.tsx`, dentro de `loadDashboard(userId)`, adicionar após as queries existentes:

```ts
const activeSubscriptions = await db
  .select({
    id: subscriptions.id,
    name: subscriptions.name,
    amount_cents: subscriptions.amount_cents,
    billing_cycle: subscriptions.billing_cycle,
    next_charge_on: subscriptions.next_charge_on,
    color: subscriptions.color,
    vendor: subscriptions.vendor,
  })
  .from(subscriptions)
  .where(
    and(
      eq(subscriptions.user_id, userId),
      eq(subscriptions.status, "active")
    )
  )
  .orderBy(asc(subscriptions.next_charge_on));
```

E retornar no objeto de retorno:
```ts
return {
  ...,
  activeSubscriptions,
};
```

Calcular total mensal normalizado (yearly/12, weekly*4.33) no componente:
```ts
const monthlyTotalCents = activeSubscriptions.reduce((sum, sub) => {
  const amount = Number(sub.amount_cents);
  if (sub.billing_cycle === "monthly") return sum + amount;
  if (sub.billing_cycle === "yearly") return sum + Math.round(amount / 12);
  if (sub.billing_cycle === "weekly") return sum + Math.round(amount * 4.33);
  if (sub.billing_cycle === "quarterly") return sum + Math.round(amount / 3);
  return sum;
}, 0);
```

### 3.6. Renderizar bloco "Assinaturas"

**Posição:** após "Próximo plantão" e antes de "Onde foi" (ou após — escolha estética sua).

**Estilo:** copiar EXATAMENTE o padrão dos outros blocos do `/dashboard`. Card rounded-3xl com background `oklch(0.21 0.007 30)` e borderColor `oklch(0.245 0.008 30)`, padding `p-5 sm:p-6`.

**Layout sugerido:**
```
[ Header: "Assinaturas" + "{n} ativas · R$ X/mês" ]

[ Lista de assinaturas ]
[avatar 36px] Spotify Family            R$ 35
              próxima 12 mai

[avatar 36px] Netflix Premium           R$ 65
              próxima 18 mai
```

**Avatar quadrado** rounded-xl com `background: color-mix(in oklch, ${sub.color} 18%, transparent)` (mesmo padrão dos avatares de transactions). Conteúdo: primeira letra do nome em uppercase.

**Próxima cobrança em destaque** se ≤3 dias: `text-amber-300`. Caso contrário: `oklch(0.55 0.006 30)`.

**Empty state:** "Nenhuma assinatura cadastrada. Use /assinatura no Telegram (em breve)."

**ATENÇÃO TRUNCATE:** nomes de assinatura podem ser longos ("GitHub Copilot Business"). Aplicar `truncate` com `min-w-0 flex-1` no parent. Vide `~/.claude/projects/-Users-luizprazeres-Agendario/memory/feedback_text_truncation.md`.

### 3.7. Validar visualmente

- Subir dev: `pnpm dev:web` em background
- Abrir `/dashboard` autenticado
- Conferir alinhamento, truncate, cores, tabular nums
- **NÃO commitar sem aprovação do usuário**

### 3.8. Commit + push como @devops

Após aprovação visual:
```bash
git add packages/db/src/schema/subscriptions.ts \
        packages/db/src/schema/index.ts \
        packages/db/sql/0002_subscriptions_rls.sql \
        packages/db/scripts/seed-subscriptions.mts \
        apps/web/src/app/dashboard/page.tsx \
        packages/db/drizzle/  # migration gerada

git commit -m "feat: subscriptions tracking + dashboard block"
git push origin main
```

Mensagem completa sugerida:
```
feat: subscriptions tracking + dashboard block

Adds subscriptions schema with billing_cycle/status, RLS policy, seed
script with realistic data, dashboard query for active subscriptions,
and UI block showing per-month total + list of upcoming charges
(amber highlight if next_charge ≤3d).

First "new entity" feature post-Native redesign — establishes the
pattern (schema → migration → seed → query → UI block) for bills,
expense_templates and credit cards next.
```

---

## 4. Perguntas em aberto

1. **Adicionar uniqueIndex (user_id, vendor)?** Útil pra detecção de duplicatas no futuro (ex: usuário lança Spotify 2x). Sugestão: SIM, já adicione.
2. **Mostrar billing_cycle no card?** "R$ 65 / mês" vs "R$ 65". Sugestão: omitir se monthly (default), mostrar "yearly" como tag pequena se yearly.
3. **Posição do bloco no dashboard?** Sugestão: após "Onde foi" (categorias), antes de "Atividade recente". Mas é estético — escolha o que parecer melhor balanceado.
4. **Captura no Telegram?** Fora de escopo desta entrega. Será fase 2 (parse intent novo `subscription_add`).

---

## 5. Artefatos relevantes

### Arquivos a criar
- `packages/db/src/schema/subscriptions.ts`
- `packages/db/sql/0002_subscriptions_rls.sql`
- `packages/db/scripts/seed-subscriptions.mts`

### Arquivos a editar
- `packages/db/src/schema/index.ts` — adicionar export
- `apps/web/src/app/dashboard/page.tsx` — adicionar query + bloco UI

### Schemas referência (já existem)
- `packages/db/src/schema/financial.ts` — `categories`, `financialAccounts`
- `packages/db/src/schema/_shared.ts` — `idColumn`, `userIdColumn`, `timestampsColumns`
- `packages/db/sql/0001_rls_policies.sql` — modelo de RLS pra copiar padrão

### Comandos úteis
```bash
# Drizzle
pnpm db:generate
pnpm db:migrate

# Dev (se não estiver rodando)
pnpm dev:web

# RLS check (deve mostrar 23/23 após este trabalho)
pnpm --filter @agendario/db exec tsx scripts/check-rls.mts

# Typecheck
pnpm --filter @agendario/web exec tsc --noEmit
pnpm --filter @agendario/db exec tsc --noEmit
```

### Credenciais teste
- Email: `contato@luizprazeres.com.br`
- Senha: `teste123`
- User UUID: `90f145e7-46bf-46fb-8425-ad633e3d7535`
- Conta principal: `12e34173-f6bd-4939-866e-43ec7b4a0677`

### Estado git no início desta task
```
9818b8e chore: add design docs, handoffs and visual previews
687aa23 feat: monthly summary + Native redesign on /dashboard
ef04bfe feat: add /login and /dashboard with Supabase SSR
0d51383 feat: auto-categorize transactions via LLM
```

---

## 6. Instruções de tom

- **Conciso**, português, sem preâmbulo
- Validar com usuário antes de commit (mostrar /dashboard rodando)
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Sem over-engineering — esta é a primeira de várias entidades novas, mantenha simples

### Armadilhas
- `amount_cents` é decimal STRING — sempre `Number()` ao usar
- `next_charge_on` é date `YYYY-MM-DD` — comparar com strings
- Mona Sans já carregada via layout.tsx — usar `style={{ fontStretch: "92%" }}` em títulos pra alinhar com Native
- OKLCH inline em surfaces — copiar valores exatos dos outros blocos do `page.tsx`
- Truncate com `min-w-0 flex-1` em containers narrow

---

**Pronto pra executar.** Comece pelo passo 3.1 (schema). Se travar em qualquer ponto, me chama via Maestri (terminal "main").
