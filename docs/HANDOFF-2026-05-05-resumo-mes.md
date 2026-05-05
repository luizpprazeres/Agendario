# Handoff: Resumo financeiro do mês no /dashboard

**Data:** 2026-05-05
**Status:** aguardando início — escopo definido, decisões tomadas

---

## 1. Objetivo

Adicionar uma section **"Resumo do mês"** no topo do `/dashboard` mostrando: total de receitas, total de gastos, saldo e top 5 categorias de gasto do mês corrente. É a evolução natural do dashboard atual (que lista transactions e shifts) e entrega valor percebido imediato sem adicionar capacidade nova ao sistema. Próxima feature após essa: Google Calendar sync para shifts.

---

## 2. Contexto essencial

### Stack
- **Monorepo pnpm** em `/Users/luizprazeres/Agendario` (apps/web, apps/bot, packages/db, packages/eslint-config)
- **apps/web:** Next.js 15.0.3 (App Router + Turbopack), Tailwind v4, port 3000
- **DB:** Supabase Cloud (project `ooesoplauirmvsyfgxen`), Drizzle ORM 0.36.4
- **Auth:** Supabase SSR (`@supabase/ssr`) já configurado em `lib/supabase/{server,client}.ts` + `middleware.ts`
- **AI:** OpenAI 4.73.1 (`client.beta.chat.completions.parse`)
- **Eventos:** Inngest 3.27.5 (porta 8288)

### Decisões já tomadas
- **Drizzle direct + filtro manual `user_id`** (não Supabase REST) — RLS bypass documentado como TODO no `dashboard/page.tsx`. Migrar quando shape de queries estabilizar.
- **Mês corrente fixo no MVP** — sem dropdown/seletor. Adicionar depois quando houver dados de 3+ meses.
- **Apenas expense por categoria** — income não precisa quebra (médico só consulta gastos pra carnê-leão).
- **Sem comparativo % vs mês anterior** — skip MVP.
- **Timezone:** `America/Recife` (constante em `serverEnv.DEFAULT_TIMEZONE`).
- **Moeda:** BRL (`Intl.NumberFormat("pt-BR")`).

### Restrições
- **Mobile-first** — Tailwind apenas, sem Radix/shadcn/Recharts sem perguntar antes
- **Português** UI/comentários
- **Sem emojis em código**
- **Sem over-engineering** — barra de proporção pode ser CSS puro (`width: X%`)

---

## 3. O que já foi feito (sessão anterior)

- ✅ Backend pipeline Telegram → parse → preview → confirm → categorize **validado e2e**
- ✅ Commit `0d51383` — auto-categorize transactions via LLM (push origin main)
- ✅ Commit `ef04bfe` — `/login` + `/dashboard` com Supabase SSR (push origin main)
- ✅ Helpers Supabase descobertos já existentes (`lib/supabase/server.ts`, `client.ts`, `middleware.ts`) — handoff anterior estava desatualizado nesse ponto
- ✅ Smoke test web: `/login` → 200, `/dashboard` → 307→`/login` quando não auth, página renderiza corretamente quando auth
- ✅ Usuário confirmou visualmente que está funcionando
- ✅ Dev server parado, porta 3000 livre

### Estado git
```
ef04bfe feat: add /login and /dashboard with Supabase SSR
0d51383 feat: auto-categorize transactions via LLM
bc0fa07 feat: complete telegram bot pipeline + ops scripts
f210e72 feat: bootstrap Agendario monorepo MVP
```
Working tree limpo exceto `docs/` (untracked, contém handoffs).

---

## 4. Estado atual

### Funcional
- Pipeline backend completo (Telegram → DB → categorize)
- Auth via Supabase SSR
- Dashboard auth-protected com 2 sections: transactions recentes + plantões próximos
- Bot operando em long-polling (`@agendariomestre_bot`)

### Pendente (este handoff)
- Section "Resumo do mês" no topo do `/dashboard` ainda não existe
- Cálculo de totais (receitas, gastos, saldo)
- Top 5 categorias de gasto

### Quebrado / conhecidos
- `/api/auth/google/callback` é stub (Google OAuth não implementado)
- `/manifest.json` e `/sw.js` retornam 404 (PWA não criado)
- `categorize-transaction` chama `sendMessage` direto no `step.run` (retry pode notificar 2x)

---

## 5. Próximos passos (ordem)

### 5.1. Calcular range do mês corrente
No `dashboard/page.tsx`, criar helpers:
```ts
function monthRange(tz = "America/Recife") {
  const now = new Date();
  // Primeiro dia 00:00 e primeiro dia do próximo mês 00:00, no TZ
  // Considerar usar date-fns-tz ou cálculo manual via Intl
  return { start: ..., end: ... };
}
```
**Atenção:** `transactions.occurred_on` é tipo `date` (sem hora), então o range pode ser comparado com `>=` start_date e `<` next_month_date.

### 5.2. Adicionar queries em `loadDashboard(userId)`
3 queries adicionais:

**a) Totais (receitas, gastos):**
```ts
db.select({
  type: transactions.type,
  total: sql<string>`SUM(${transactions.amount_cents})`,
})
.from(transactions)
.where(and(
  eq(transactions.user_id, userId),
  gte(transactions.occurred_on, startStr),
  lt(transactions.occurred_on, endStr),
  inArray(transactions.type, ["income", "expense"])
))
.groupBy(transactions.type);
```

**b) Top 5 categorias de gasto:**
```ts
db.select({
  category_id: transactions.category_id,
  category_name: categories.name,
  category_icon: categories.icon,
  category_color: categories.color,
  total: sql<string>`SUM(ABS(${transactions.amount_cents}))`,
})
.from(transactions)
.leftJoin(categories, eq(categories.id, transactions.category_id))
.where(and(
  eq(transactions.user_id, userId),
  eq(transactions.type, "expense"),
  gte(transactions.occurred_on, startStr),
  lt(transactions.occurred_on, endStr),
))
.groupBy(transactions.category_id, categories.name, categories.icon, categories.color)
.orderBy(desc(sql`SUM(ABS(${transactions.amount_cents}))`))
.limit(5);
```

### 5.3. Renderizar section "Resumo do mês" ANTES de transactions
- Header: nome do mês capitalizado em pt-BR (ex: "Maio 2026") via `Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })`
- Grid 3 colunas (mobile: 1 coluna stack) com cards:
  - **Receitas** (verde)
  - **Gastos** (vermelho)
  - **Saldo** (cor neutra ou conforme sinal)
- Lista compacta de top 5 categorias com:
  - Ícone + nome + valor
  - Barra de proporção CSS pura (% sobre maior categoria)

### 5.4. Validar
- `pnpm --filter @agendario/web exec tsc --noEmit`
- `pnpm dev:web` → abrir `/dashboard` autenticado
- Verificar que números fazem sentido (1 transaction de teste já existe: -150 em Restaurantes, dia 2026-05-04)

### 5.5. Commit + push como @devops
```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat: monthly summary section in /dashboard"
git push origin main
```

### 5.6. Empty states
- Se `total receitas === 0 && total gastos === 0`: mostrar "Sem movimentação este mês"
- Se `top categorias === []`: omitir lista (não mostrar header vazio)

---

## 6. Perguntas em aberto

1. **Posicionamento da section:** topo absoluto (acima de "Transações recentes") ou abaixo do header? Sugestão: topo absoluto.
2. **Saldo do mês vs saldo total das contas:** este handoff cobre só "saldo do mês" (receitas - gastos do período). Saldo das contas (`financial_accounts.initial_balance_cents` + soma histórica) fica pra depois.
3. **Cor do saldo:** verde se positivo, vermelho se negativo, ou neutro sempre? Sugestão: verde positivo, vermelho negativo, zinc-300 se zero.
4. **Cliques nas categorias** abrem filtro/drilldown? **NÃO no MVP** — apenas display.

---

## 7. Artefatos relevantes

### Arquivo a editar
- `apps/web/src/app/dashboard/page.tsx` — única alteração necessária

### Schemas referência
```ts
// packages/db/src/schema/financial.ts

// transactions
//   amount_cents: decimal(14, 0) STRING — assinado (negativo expense, positivo income)
//   type: 'income' | 'expense' | 'transfer'
//   occurred_on: date (formato 'YYYY-MM-DD')
//   category_id: uuid nullable

// categories
//   name, slug, icon, color, type
```

### Imports Drizzle adicionais necessários
```ts
import { sql, inArray, lt, gte } from "drizzle-orm";
```

### Comandos úteis
```bash
# Dev web (apenas web, mais leve)
pnpm dev:web

# Dev completo (web + bot)
pnpm dev

# Inngest dev
pnpm dev:inngest

# Typecheck
pnpm --filter @agendario/web exec tsc --noEmit

# Verificar entidades do user (debugging)
pnpm --filter @agendario/db exec tsx scripts/check-entities.mts 90f145e7-46bf-46fb-8425-ad633e3d7535
```

### Credenciais teste
| Campo | Valor |
|---|---|
| Email | `contato@luizprazeres.com.br` |
| Senha | `teste123` |
| User UUID | `90f145e7-46bf-46fb-8425-ad633e3d7535` |
| URL | http://localhost:3000/login |

### URLs
- App: http://localhost:3000
- Inngest: http://localhost:8288
- Supabase: https://ooesoplauirmvsyfgxen.supabase.co
- GitHub: https://github.com/luizpprazeres/Agendario

---

## 8. Instruções pra próxima sessão

### Tom
- **Conciso**, português, sem preâmbulo
- Confirmar antes de ações arriscadas (git push autorizado pra @devops)
- Não over-engineer — UI mínima, sem libs novas (Radix/shadcn/Recharts) sem perguntar
- Não adicionar features fora do escopo (filtros, drilldowns, comparativos) sem pedir

### Armadilhas conhecidas
1. **`amount_cents` é decimal STRING** no Drizzle — sempre `Number()` ao usar; soma SQL retorna string, converter no JS
2. **Sinal vem no próprio valor** — expense é negativo, income positivo. `SUM` direto dá saldo. Para "total de gastos absoluto" usar `SUM(ABS(amount_cents))` ou `SUM(amount_cents) * -1` filtrando type='expense'
3. **`occurred_on` é date** (string `YYYY-MM-DD`), não timestamp — comparar com strings de data
4. **Symlink `.env.local`** precisa existir em `apps/web/.env.local → ../../.env.local`
5. **Drizzle `.returning()` retorna array** — destructurar com guard
6. **Server components + cookies():** `cookies()` é async no Next 15, sempre `await`
7. **`Intl.DateTimeFormat` com `month: "long"`** retorna lowercase em pt-BR — capitalizar manualmente se quiser título Case
8. **Inngest hot-reload** funciona automático via PUT /api/inngest, não reiniciar

### Workflow de commits
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Heredoc para corpo: `git commit -m "$(cat <<'EOF'...\nEOF\n)"`
- Atuar como **@devops (Gage)** pra git push (autorização do usuário)
- Nunca `--no-verify` ou `--force` sem pedido explícito

### Antipatterns a evitar
- ❌ Criar componentes separados pra cards/barras — inline no `page.tsx` está OK
- ❌ Instalar Recharts/Chart.js/visx — barras CSS resolvem
- ❌ Refatorar `loadDashboard` em múltiplos arquivos — manter single file
- ❌ Adicionar comentários óbvios
- ❌ `any` em TypeScript — usar `unknown` + narrowing
- ❌ Criar nova rota / API route — tudo via server component direto

### Após esse sprint
Próxima feature recomendada: **Google Calendar sync para shifts**.
- Stub OAuth em `/api/auth/google/callback`
- Schema `shifts.gcal_event_id`, `gcal_calendar_id`, `gcal_etag` já existem
- Inngest function `shifts/created` → `gcal.events.insert`
- Estimativa: 2-3 sessões

---

**Pronto pra retomar.** Comece pelo passo 5.1 (calcular range do mês). Escopo fechado, sem decisões de produto pendentes — só execução.
