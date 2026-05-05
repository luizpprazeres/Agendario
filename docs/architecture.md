# Agendario — Arquitetura e Roadmap

**Última atualização:** 2026-05-05
**Versão da plataforma:** pre-1.0 (em desenvolvimento ativo)
**Mantenedor primário:** Luiz Paulo (`@luizprazeres`)

---

## Sumário

- [Parte 1 — Plataforma](#parte-1--plataforma)
  - [1. Visão de produto](#1-visão-de-produto)
  - [2. Persona alvo e problemas resolvidos](#2-persona-alvo-e-problemas-resolvidos)
  - [3. Diferencial vs concorrência](#3-diferencial-vs-concorrência)
  - [4. Stack técnica](#4-stack-técnica)
  - [5. Estrutura do monorepo](#5-estrutura-do-monorepo)
  - [6. Domain model](#6-domain-model)
  - [7. Data flows principais](#7-data-flows-principais)
  - [8. Integrações externas](#8-integrações-externas)
  - [9. Funcionalidades implementadas](#9-funcionalidades-implementadas)
  - [10. Multi-tenant e segurança (RLS)](#10-multi-tenant-e-segurança-rls)
  - [11. Convenções de código](#11-convenções-de-código)
  - [12. Configurações e variáveis](#12-configurações-e-variáveis)
  - [13. Dívida técnica conhecida](#13-dívida-técnica-conhecida)
- [Parte 2 — Roadmap](#parte-2--roadmap)
  - [14. Horizon 1 — Now (próximas 2 semanas)](#14-horizon-1--now-próximas-2-semanas)
  - [15. Horizon 2 — Next (1-3 meses)](#15-horizon-2--next-1-3-meses)
  - [16. Horizon 3 — Later (3-6 meses)](#16-horizon-3--later-3-6-meses)
  - [17. Horizon 4 — Dream (6-12+ meses)](#17-horizon-4--dream-6-12-meses)
  - [18. Princípios estratégicos](#18-princípios-estratégicos)

---

# Parte 1 — Plataforma

## 1. Visão de produto

**Agendario** é um sistema integrado de **gestão financeira pessoal + agenda profissional** desenhado para **médicos plantonistas brasileiros**. A premissa central é que finanças e tempo, pra quem trabalha por turno, são **a mesma planilha mental**: o usuário não pensa "minha conta tem X" sem pensar "tenho Y plantões esse mês". Os apps existentes (Mobills, Organizze, GuiaBolso, Copilot Money, YNAB) tratam dinheiro isolado da agenda; calendários (Apple Calendar, Google Calendar) tratam tempo isolado de receita. **Agendario funde os dois domínios** num único produto, com captura via Telegram, processamento por LLM e dashboard único.

A diferença não é apenas categorização vertical — é um modelo de dados que entende plantão como evento financeiro (entrada futura), conta médica como categoria deductível (carnê-leão), e fatura de cartão como ciclo financeiro distinto do mês civil.

---

## 2. Persona alvo e problemas resolvidos

### Persona: o médico plantonista urbano

Renda variável (plantões + consultas particulares + atendimento PJ), múltiplos hospitais por semana, vida que oscila entre alta intensidade (24h sem dormir) e janelas curtas pra resolver pessoa-jurídica. Gasta padrão repetitivo: combustível, almoço de hospital, café, iFood entre plantões, Uber quando vira. Recebe por múltiplas fontes (PJ, RPA, holerites de cooperativa). Precisa declarar carnê-leão mas perde recibos. Quer ver "tô bem ou tô apertado?" em **3 segundos no celular**.

### Problemas concretos atacados

| Problema | Solução do Agendario |
|---|---|
| Capturar gasto na correria sem abrir app | Telegram: foto, áudio (em fila), ou "gastei 50 micale ontem" |
| Conciliar fatura cartão (datas misturadas, parcelamentos) | OCR vision + dedupe SHA-256 + detecção de período + parser de parcelamento |
| Esquecer pra onde foi o dinheiro | Auto-categorização rule-engine + LLM + cache de aliases aprendidas |
| Não ver receita futura quando planeja gasto | Plantões agendados aparecem como entrada futura no dashboard |
| Carnê-leão dolorido todo mês | Flag `deductible_carne_leao` por categoria → export futuro pro contador |
| Plantão não bater com calendário pessoal | Sync automático app → Google Calendar com locking de campos |
| Capturar recibo físico no plantão | Foto via Telegram → batch → review web → confirma N transações |
| Assinaturas escondidas drenando renda | Tabela dedicada com `next_charge_on`, alerta "próxima amanhã" |
| Repetir gastos comuns sem digitar tudo | Despesas favoritas (chips 1-clique no dashboard) |

---

## 3. Diferencial vs concorrência

| Eixo | Mobills/Organizze | Copilot Money | YNAB | **Agendario** |
|---|---|---|---|---|
| Captura por Telegram | Não | Não | Não | **Sim, end-to-end** |
| LLM para parsing/categoria | Limitado | Sim | Não | **Vision + structured output** |
| Plantões integrados | Não | Não | Não | **Schema nativo + sync GCal** |
| Carnê-leão BR | Manual | Não | Não | **Flag deductible no schema** |
| OCR fatura BR | Manual | EUA only | Não | **Multi-banco + dedupe** |
| Server Components moderno | — | — | — | **Next.js 15 RSC** |
| Multi-tenant via RLS | — | — | — | **Postgres RLS enforced** |
| Open source / hackeável | Não | Não | Não | **Privado, mas single-tenant possível** |

A combinação **vertical médica × stack moderna × LLM nativo × captura por Telegram** não existe em nenhum produto comercial brasileiro nem internacional.

---

## 4. Stack técnica

### Core

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 20+ |
| Framework | Next.js (App Router) | 15.5.15 |
| UI lib | React (Server + Client) | 19 |
| Linguagem | TypeScript (strict) | 5.6.3 |
| Estilo | Tailwind CSS | 4.0.0-beta.4 |
| Animações | Framer Motion | latest |
| Ícones | Lucide React | latest |

### Persistência

| Camada | Tecnologia |
|---|---|
| Database | PostgreSQL (Supabase managed) |
| ORM | Drizzle ORM 0.36.4 + Drizzle Kit 0.28.1 |
| Cliente nativo | postgres 3.4.5 |
| Auth | Supabase Auth (`@supabase/ssr` 0.5.2) |
| Storage | Supabase Storage (bucket `receipts` privado) |
| Multi-tenant | Postgres Row Level Security |

### Async + Integrações

| Componente | Tecnologia |
|---|---|
| Job orchestration | Inngest 3.27.5 |
| LLM | OpenAI 4.73.1 (gpt-4o, gpt-4.1-mini, gpt-4o-mini) |
| Telegram bot | Grammy 1.32.0 |
| Google Calendar | googleapis 171.4.0 |
| PDF parsing | UnPDF 1.6.2 |
| CSV parsing | PapaParse 5.5.3 |
| Validação runtime | Zod 3.23.8 |

### DevOps

| Componente | Tecnologia |
|---|---|
| Monorepo | pnpm 10.33.3 + workspaces |
| Tests | Vitest 4.1.5 |
| Lint | ESLint 9.16.0 |
| Hosting | Vercel (web) + Supabase (db) + Inngest Cloud |
| Build | Next.js Turbopack |

---

## 5. Estrutura do monorepo

```
Agendario/
├── apps/
│   ├── web/              # Next.js 15 App Router (UI + API + server actions)
│   └── bot/              # Telegram bot grammy long-polling (dev only)
├── packages/
│   └── db/               # Drizzle schema, migrations, RLS SQL, seeds
│       ├── src/schema/   # 14 arquivos de schema (1 por domínio)
│       ├── sql/          # 4 arquivos RLS aplicados manualmente
│       ├── drizzle/      # migrations geradas (Drizzle Kit)
│       └── scripts/      # seeds (categorias, expense templates)
├── docs/                 # design brief, handoffs, research, este arquivo
├── pnpm-workspace.yaml
└── package.json          # scripts: dev, build, db:*, lint, typecheck
```

**Regra de ouro:** lógica de domínio mora em `apps/web/src/lib/`, **não** em `packages/db`. O package `db` é puro schema + cliente.

---

## 6. Domain model

### Diagrama lógico (texto)

```
auth.users (Supabase) ─┬─ profiles (1:1, trigger on_auth_user_created)
                       │
                       ├─ workplaces ──── shifts ───── recurrence_rules
                       │              ├─ shift_templates
                       │              └─ tasks ──────── recurrence_rules
                       │
                       ├─ financial_accounts ───┬── transactions ─── categories
                       │                        │                    └─ category_cache
                       │                        ├── budgets
                       │                        ├── financial_goals
                       │                        ├── subscriptions
                       │                        └── expense_templates
                       │
                       ├─ rules ──── rule_conditions
                       │           └─ rule_actions
                       │
                       ├─ inbox_items (polimórfico: task | shift | transaction | note)
                       │
                       ├─ inbox_batches ──── inbox_batch_items ─── transactions
                       │                  └─ description_aliases
                       │
                       ├─ insights (LLM-generated)
                       │
                       └─ integrations:
                          ├─ google_calendar_tokens
                          ├─ google_calendars
                          ├─ google_calendar_watches
                          ├─ telegram_users
                          └─ imports
```

### Tabelas-chave (resumo executivo)

#### Identidade

- **profiles** (1:1 com `auth.users`): nome, timezone (default `America/Recife`), `default_currency` (`BRL`), `telegram_chat_id`, `specialty`, `crm`, `preferences` (jsonb).

#### Agenda profissional

- **workplaces**: hospitais/clínicas. Cor para tint visual, `default_hourly_rate_cents`, `default_shift_pay_cents`.
- **shift_templates**: templates recorrentes (ex: "Einstein 19-7 sábado") via FK para `recurrence_rules`.
- **shifts**: instâncias concretas. Campos `gcal_event_id`, `gcal_etag`, `locked_attributes` para sync com Google Calendar.
- **tasks**: TODO list com time-blocking opcional (também sincável com GCal). Suporta `parent_task_id` para subtasks e `recurrence_rules`.
- **recurrence_rules**: motor RRULE (RFC 5545) com `freq`, `byweekday`, `bymonthday`, `count`, `until`.

#### Finanças

- **financial_accounts**: contas. Tipos: `checking | savings | credit_card | cash | investment | loan | other`. Sufixo `_cents` em `initial_balance_cents` (decimal signed).
- **categories**: hierárquicas via `parent_id`, com flag `deductible_carne_leao`. UNIQUE `(user_id, slug)`.
- **transactions**: single-entry. `amount_cents` é decimal **com sinal** (`+` entrada, `−` saída). Campos `auto_categorized_by` (rule | cache | llm), `auto_confidence`, `locked_attributes` (campos congelados pelo user). UNIQUE `(user_id, account_id, external_id)` para dedupe.
- **budgets**, **financial_goals**: limites e metas.
- **rules** + **rule_conditions** + **rule_actions**: rule engine inspirado em Firefly III. Condições: `description_contains`, `regex`, `amount_*`, `account_eq`, `weekday_eq`. Ações: `set_category`, `add_tag`, `set_workplace`, `mark_deductible`, `split_amount`.
- **category_cache**: aceleradora. `description_key` normalizado (lowercase, sem acento, sem números) → `category_id` + `hit_count`.
- **subscriptions**: assinaturas com `billing_cycle` (`weekly | monthly | quarterly | yearly`) e `next_charge_on`.
- **expense_templates**: despesas favoritas (1-clique). `usage_count` ordena no dashboard.

#### Captura

- **inbox_items**: polimórfico. `channel` (`telegram | whatsapp | web | email | csv_import | ofx_import`), `intent` (`task | shift | transaction | note | unknown`), `payload` (jsonb Zod-validated), `confidence`, `llm_*_tokens`. Resolve em entidade real via `resolved_entity_table` + `resolved_entity_id`.
- **inbox_batches**: pipeline de fatura. Campos `source_file_hash` (dedupe), `detected_origin` (`nubank_invoice | itau_extract | bb_invoice | unknown`), `statement_period_start/end`, `status` (`parsing | review | confirmed | discarded | failed`).
- **inbox_batch_items**: linhas extraídas. `is_duplicate`, `installment_current/total`, `suggested_category_id`.
- **description_aliases**: aprendizado. "AMZN MKTP BR" → "Amazon" + categoria sugerida.

#### Integrações

- **google_calendar_tokens**: OAuth tokens (refresh + access).
- **google_calendars**: calendários sincáveis com `sync_enabled`, `sync_direction` (`pull | push | both`).
- **google_calendar_watches**: push notifications (renovação a cada 7d — pendente).
- **telegram_users**: vinculação `chat_id ↔ user_id`.
- **imports**: histórico de CSV/OFX importados.

#### Inteligência

- **insights**: LLM-generated. `kind` (`monthly_summary | shift_finance_correlation | cashflow_projection | carne_leao_export | anomaly_alert`). Custos LLM rastreados em `cost_cents_estimate`.

### Convenções de schema

- Toda tabela user-scoped tem `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- Toda tabela tem `created_at`, `updated_at` (timestamptz, default `now()`).
- Money em `*_cents` decimal (precision 14, scale 0). **Sempre signed**.
- Datas em `*_on` (date, sem tz) para eventos discretos; timestamps em `*_at` (timestamptz).
- `external_id` (text) para dedupe contra IDs de fontes externas (FITID OFX, message_id Telegram).
- `metadata` (jsonb default `'{}'`) em quase todas as tabelas para extensibilidade.
- `locked_attributes` (jsonb array) onde houver sync bidirecional, congela campos do user contra overwrites.

---

## 7. Data flows principais

### Fluxo A — Transação via Telegram

```
1. User → Telegram: "gastei 150 micale ontem"
2. Telegram → POST /api/webhooks/telegram (com X-Telegram-Bot-Api-Secret-Token)
3. Webhook valida secret, cria inbox_items(status=pending, raw_content="...")
4. Inngest event: inbox/item.parse-requested
5. parseInboxItem function:
   - OpenAI structured output (gpt-4o-mini)
   - Detecta intent=transaction, amount=150, description="Micale"
   - Categoriza via rule engine → cache → LLM
   - Persiste payload, confidence, tokens consumidos
6. renderPreview gera mensagem Telegram com inline buttons (✅ Confirmar / ❌ Cancelar)
7. User clica ✅
8. Callback query → Inngest event: inbox/item.confirmed
9. confirmInboxItem function:
   - INSERT transactions(amount_cents=-15000, ..., source=telegram)
   - UPDATE inbox_items(status=confirmed, resolved_entity_*)
   - Se category=null, dispara transactions/categorize-requested
10. Dashboard server-rendered mostra na próxima visita
```

### Fluxo B — Fatura por foto

```
1. User → Telegram: foto da fatura OU upload em /importar
2. Webhook ou route /api/receipts/upload baixa o arquivo
3. SHA-256 dedupe contra inbox_batches.source_file_hash
4. INSERT inbox_batches(status=parsing, detected_origin=...)
5. Inngest event: receipts/extract-requested
6. extractReceiptFn function:
   - Detecta tipo (image | pdf | csv | ofx)
   - Image: signed URL (5min) + gpt-4.1-mini vision
   - PDF: unpdf text + gpt-4o-mini structured prompt
   - CSV/OFX: parsers nativos sem LLM
   - Carrega aliases do user, aplica match
   - Detecta duplicatas vs últimas 200 transactions
   - INSERT bulk em inbox_batch_items (suggested_category_id, confidence)
   - UPDATE batch status=review
7. User → /importar/[batch_id]
8. Review UI: edita descrição, ajusta categoria, escolhe conta destino
9. Server action confirma:
   - Bulk INSERT transactions
   - UPDATE inbox_batch_items(transaction_id, status=confirmed)
   - UPDATE inbox_batches(status=confirmed, confirmed_at)
   - Aprende novos aliases (upsertAlias)
```

### Fluxo C — Plantão → Google Calendar

```
1. User → Telegram: "plantão amanhã 19-7 einstein"
2. Parse intent=shift, payload validado por Zod
3. User confirma preview
4. confirmInboxItem cria shifts(...)
5. Inngest event: gcal/sync-push
6. syncShiftToGcal function:
   - Carrega google_calendar_tokens, refresh se expirado
   - Calendar API insertEvent ou patchEvent
   - Persiste gcal_event_id + gcal_etag em shifts
7. Sync incremental futuro respeita locked_attributes (user pode editar título no GCal sem ser sobrescrito)
```

---

## 8. Integrações externas

### Telegram

- **Framework:** Grammy 1.32.0.
- **Modos:**
  - **Dev:** `apps/bot` em long-polling, forwarda para `localhost:3000/api/webhooks/telegram`.
  - **Prod:** webhook direto apontando para `https://<domain>/api/webhooks/telegram`.
- **Validação:** header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET` (com fallback dual-header).
- **Tipos de mensagem:**
  - text → inbox_items
  - photo → receipt batch (vision)
  - document → receipt batch (PDF/CSV/OFX)
- **Comandos:** `/start`, `/ping`. Comandos extra (`/saldo`, `/proximo`, `/fatura`) estão no roadmap.

### Inngest

- 7 funções registradas em `apps/web/src/lib/inngest/functions/index.ts`.
- Endpoint: `/api/inngest` (handle GET/POST/PUT).
- Dev local: `pnpm dlx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
- Retries: 3x default (2x para extract-receipt para evitar custo LLM duplicado).

### OpenAI

- **gpt-4o-mini:** parsing de intent, categorização, OCR PDF.
- **gpt-4.1-mini:** vision OCR de faturas (imagem).
- **gpt-4o:** insights (qualidade alta, custo aceitável uma vez por mês).
- **Structured output** via Zod schemas para deterministic parsing.
- **Cost tracking** persistido em `inbox_items.llm_*_tokens` e `insights.cost_cents_estimate`.

### Google Calendar

- OAuth 2.0 com `prompt=consent` para garantir refresh_token.
- Tokens em `google_calendar_tokens` (plain text — encryption pendente para prod).
- Sync 1-way (push) implementado. Sync 2-way (pull via watch channels) pendente.
- Idempotência via `gcal_event_id` + `etag`.

### Supabase

- **Auth:** email/password + Google OAuth.
- **Storage:** bucket `receipts` privado, RLS enforced. Signed URLs 5min para vision LLM.
- **Database:** Postgres 15 com extensões pg-cron disponíveis.

---

## 9. Funcionalidades implementadas

### Páginas web

| Rota | Descrição |
|---|---|
| `/` | Landing/home |
| `/login` | Email + password (Supabase) |
| `/dashboard` | Saldo, sparkline, top categorias, próximo plantão, atividade recente, assinaturas, próximos plantões, **favoritos** (chips 1-clique) |
| `/dashboard/billing-cycle-preview` | Preview standalone do redesign de fatura cartão (em curso) |
| `/importar` | Upload de fatura/extrato (CSV/OFX/PDF/imagem) |
| `/importar/[batch_id]` | Review e confirmação de items extraídos |
| `/conectar-google` | OAuth flow Google Calendar |

### API routes

| Rota | Método | Descrição |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/auth/google/callback` | GET | OAuth callback Google |
| `/api/inngest` | GET/POST/PUT | Webhook Inngest |
| `/api/receipts/upload` | POST | Upload web de fatura |
| `/api/webhooks/telegram` | POST | Webhook do bot |

### Inngest functions

1. **parseInboxItem** — LLM parse intent
2. **confirmInboxItem** — cria entidade real (transaction/shift/task)
3. **categorizeTransactionFn** — auto-categorização rule + LLM se confidence < 0.6
4. **extractReceiptFn** — OCR + parsing de batches
5. **syncShiftToGcal** — push shifts para Google Calendar
6. **generateMonthlyInsightsCron** — cron 1º do mês, 6h America/Recife
7. **generateMonthlyInsightsOnDemand** — manual trigger

### Server actions importantes

- `signOut` (logout)
- `applyTemplate` (aplica despesa favorita 1-clique → INSERT transaction + bump usage_count + Inngest categorize se sem categoria)
- Confirmação de batch em `/importar/[batch_id]`

### PWA

- Manifest, ícones, instalável em iPhone (testado).

---

## 10. Multi-tenant e segurança (RLS)

### Estratégia

Toda tabela user-scoped tem **RLS habilitado** com policy `user_id = auth.uid()` em USING e WITH CHECK. Tabelas filhas (rule_conditions, rule_actions, inbox_batch_items) usam EXISTS na tabela pai.

### Arquivos SQL aplicados

```
packages/db/sql/0001_rls_policies.sql       # 20+ tabelas
packages/db/sql/0002_subscriptions_rls.sql
packages/db/sql/0003_receipts_rls.sql
packages/db/sql/0004_expense_templates_rls.sql
```

### Triggers

- **on_auth_user_created** (em `auth.users` AFTER INSERT) → cria `profiles` row.
- **set_updated_at** (em todas tabelas com `updated_at`) → toca timestamp em UPDATE.

### Bypass legítimo

- **Service role** (via `createSupabaseServiceClient`) bypassa RLS. Usado em Inngest functions que precisam admin ops (Storage signed URLs, bulk inserts em batches, etc).

### Conhecida divida

`apps/web/src/app/dashboard/page.tsx` ainda usa **Drizzle direto via postgres role** (bypassa RLS por construção). Filtro manual `eq(transactions.user_id, userId)` é a única defesa. **Migração para `getRlsDb(userId)` planejada** quando o shape de queries do dashboard estabilizar (TODO comentado em produção, linha 194-196).

---

## 11. Convenções de código

### Naming

- Tabelas e colunas: **snake_case** (`financial_accounts`, `amount_cents`).
- Enums Postgres: snake_case lowercase (`inbox_status`, `account_type`).
- Foreign keys: sufixo `_id`.
- Money: sufixo `_cents` (decimal signed).
- Datas (sem hora): sufixo `_on` (`occurred_on`, `next_charge_on`).
- Timestamps: sufixo `_at` (`created_at`, `confirmed_at`).
- Constantes: SCREAMING_SNAKE_CASE.
- React components: PascalCase, files kebab-case (`expense-templates.tsx`).

### Next.js 15 patterns

- Server Components por padrão. `"use client"` só onde imprescindível.
- Server Actions (`"use server"`) para mutations dentro de page files quando viáveis.
- API routes em `/api/[...]/route.ts` (não usar `/pages`).
- Middleware para refresh de sessão Supabase.
- `revalidatePath("/dashboard")` após mutations.

### Drizzle

- Schema split por domínio (`profiles.ts`, `financial.ts`, `receipts.ts`...).
- Helpers em `_shared.ts` (`idColumn`, `userIdColumn`, `timestampsColumns`).
- Indexes inline no segundo argumento do `pgTable`.
- Tipos via `.$inferSelect` / `.$inferInsert`.

### UI

- **Tema escuro fixo** em OKLCH.
- Tokens recorrentes:
  - bg page: `oklch(0.17 0.006 30)`
  - bg card: `oklch(0.21 0.007 30)`
  - border: `oklch(0.28 0.008 30)`
  - muted text: `oklch(0.55 0.006 30)`
- Cores funcionais: `emerald-400` (receita), `red-400` (despesa), `amber-400` (atenção).
- Tipografia: Inter com `fontStretch` (`90%`, `92%`, `94%`) em headlines.
- Numbers: **sempre `tabular-nums`**.
- Mobile-first com breakpoints `sm: 640` / `md: 768` / `lg: 1024` / `xl: 1280`.

### Validação

- Zod no perímetro: env vars (`apps/web/src/env.ts`), webhook payloads, server actions, API bodies.
- TypeScript strict — sem `any` deliberado em produção.

---

## 12. Configurações e variáveis

### `.env.local` esperado

```
# Database
DATABASE_URL=postgresql://...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# OpenAI
OPENAI_API_KEY=...
OPENAI_MODEL_PARSE=gpt-4o-mini
OPENAI_MODEL_INSIGHTS=gpt-4o
OPENAI_MODEL_VISION=gpt-4.1-mini

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# App
DEFAULT_TIMEZONE=America/Recife
DEFAULT_CURRENCY=BRL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Scripts úteis

```bash
pnpm dev                    # web + bot + inngest
pnpm dev:web                # só web
pnpm dev:bot                # só bot
pnpm dev:inngest            # Inngest dev server
pnpm build                  # build all
pnpm lint                   # ESLint all
pnpm typecheck              # tsc all
pnpm db:generate            # drizzle-kit generate
pnpm db:migrate             # drizzle-kit migrate
pnpm db:studio              # Drizzle Studio
pnpm db:seed:categories     # seed categorias default
```

---

## 13. Dívida técnica conhecida

### Crítica (resolver antes de prod multi-user)

- **RLS bypass no dashboard** (`page.tsx` usa Drizzle direto, `// TODO` linha 194). Filtro manual é a única defesa.
- **Google OAuth tokens em plain text.** Encryption at-rest pendente.
- **Telegram webhook secret** precisa rotação programada.

### Alta (afeta produto)

- **PDF OCR limitado a 1 página.** Refactor do unpdf pipeline necessário.
- **Sync reverso GCal não implementado** (só push).
- **Watch channels precisam renovação a cada 7d** (cron pendente).
- **Sem settings page web** (gestão de contas, categorias, regras só via DB direto).
- **Expense templates sem CRUD web** (só seed via script).

### Média (qualidade interna)

- **Coverage de testes baixa** (Vitest configurado, poucos arquivos de teste).
- **Sem E2E** (Playwright não configurado).
- **Sem integration tests pra Inngest functions.**
- **CSV parsers duplicados** entre `apps/web/src/lib/parsers/csv.ts` e `apps/web/src/lib/csv-import/parsers/*` (resultado de trabalho paralelo entre agents — consolidar).

### Baixa (cosmético / futuro)

- Sparkline do dashboard usa `recentTx` invertido como aproximação (linha 435 da page). Query dedicada de saldo diário daria gráfico fiel.
- Algumas mensagens de erro Telegram são genéricas demais.
- Sem rate limiting explícito nas rotas API.

---

# Parte 2 — Roadmap

## 14. Horizon 1 — Now (próximas 2 semanas)

**Tema:** fechar o loop de uso diário cobrindo as features em fila, polir a experiência web em desktop.

### Em curso (sessão atual)

| Item | Status | Owner |
|---|---|---|
| Dashboard responsivo desktop (grid 12-col em `lg:`) | em curso | Claude Code #3 |
| Credit cards merge | em curso | outro agent paralelo |
| Billing cycle UX redesign (`/dashboard/billing-cycle-preview`) | em curso | Claude Code #4 |

### Em fila

| Item | Por quê | Effort |
|---|---|---|
| **Bills** (recorrentes não-assinatura: aluguel, condomínio, escola) | Schema próximo de subscriptions, mas semântica diferente (data fixa do mês, não vendor SaaS) | M |
| **Quick-add web** | Alternativa ao Telegram quando user tá no PC. Form simples, mesmo pipeline LLM | S |
| **Expense templates CRUD web** | Hoje só via seed; user precisa criar/editar do app | M |
| **Tasks dashboard** | Schema existe, falta UI dedicada com filtros (hoje/semana/atrasadas) | M |
| **Resumo do mês** (já tem handoff doc) | Card consolidado: receita, despesa, líquido, top categoria, dia mais caro | S |

### Nice-to-have curto

- Comandos Telegram extras: `/saldo`, `/proximo`, `/fatura`, `/uber`, `/cafe` (atalhos para templates por nome).
- Configurar rate limiting básico no webhook Telegram (10 msgs/min/chat).

---

## 15. Horizon 2 — Next (1-3 meses)

**Tema:** consolidar o produto. Tudo gerenciável pelo app, insights úteis, robustez de dados.

### Settings page completa

Rota `/settings` com tabs:

- **Contas** — CRUD financial_accounts. Ícone, cor, conta padrão, archive.
- **Hospitais/Workplaces** — CRUD com `default_hourly_rate_cents`, cor, address.
- **Categorias** — árvore hierárquica drag-drop, edição de slug/icon/color, flag carnê-leão.
- **Regras** — UI visual pra rule engine (conditions + actions). Preview "essa regra teria capturado X transações".
- **Integrações** — Telegram chat_id binding, Google Calendar (per-calendar toggle), revoke.
- **Importações** — histórico de imports/batches.
- **Carnê-leão** — flag global ON/OFF, percentual default, lista de categorias dedutíveis.
- **Conta** — perfil, senha, timezone, currency, danger zone (delete).

### Insights LLM mensais

Schema `insights` já existe. Cron `generateMonthlyInsightsCron` já roda. Falta:

- **Render bonito** em `/dashboard/insights/[id]` ou drawer no dashboard.
- **Tipos:**
  - `monthly_summary` — narrativa em 4-6 parágrafos com hooks tipo "você gastou 47% mais com iFood que mês passado".
  - `shift_finance_correlation` — "meses com >8 plantões: gasto +R$X em delivery".
  - `cashflow_projection` — projeção 30/60/90 dias considerando plantões agendados + assinaturas + médias.
  - `anomaly_alert` — push pro Telegram quando categoria diverge >2 desvios do baseline.

### PDF multi-página

Refactor do `extractReceiptFn`:

- Loop por página com unpdf.
- Concatena texto preservando markers de página.
- Prompt LLM com instrução pra reconciliar items "continuados" entre páginas.
- Limite de tokens por chunk (gpt-4o-mini suporta 128k input, mas qualidade cai depois de ~50k).

### Carnê-leão export

Endpoint `/api/exports/carne-leao?month=YYYY-MM`:

- Query `transactions` JOIN `categories` WHERE `deductible_carne_leao = true`.
- Output: CSV pronto pra contador OU XML padrão Receita Federal.
- UI em `/settings/carne-leao` com botão "Gerar mês X".

### Reembolsos / splits

- Schema novo: `transaction_splits` (transaction_id, party_name, amount_cents, status: pending|received).
- UI: ao criar transaction, opção "dividir com..." → cria split pending → user marca received quando chegar Pix.
- Insight: "você tem R$ X em reembolsos pendentes há mais de 30 dias".

### iOS PWA polish

- Splash screen via `apple-touch-startup-image`.
- Pull-to-refresh nativo.
- Haptic feedback em ações críticas (confirmar transaction, deletar).
- Widget de saldo (testar via Scriptable + endpoint público com magic link).

### Testes

- Vitest coverage target: 60% no `packages/db/scripts` e `apps/web/src/lib/parsers`.
- Playwright E2E mínimo: login → dashboard → adicionar template → confirmar.
- Inngest function tests com `inngestTest` SDK.

---

## 16. Horizon 3 — Later (3-6 meses)

**Tema:** diferenciar. Recursos que tornam Agendario insubstituível pra quem prova.

### Sync bidirecional Google Calendar

- Watch channels com renovação automática (cron a cada 6 dias).
- Pull: GCal events com prefixo `[Plantão]` ou label específico viram shifts no app.
- Conflict resolution: `locked_attributes` controla quem ganha.

### Banking integrations reais

**Brazilian Open Finance** quando o produto tiver scope (regulação BACEN exige autorização de TPP):

- Pluggy / Belvo como provider (custo ~R$ 0.50/conexão/mês).
- Transações sincadas automaticamente (substitui import CSV manual).
- Saldo bate sem reconciliação humana.

### Cashflow projection IA

- Modelo simples primeiro: receitas conhecidas (plantões agendados + holerite recorrente) − gastos médios (rolling 90d) − assinaturas conhecidas.
- Modelo IA depois: gpt-4o consulta histórico, considera sazonalidade (dezembro gasta mais), gera narrativa.
- UI: gráfico de linha 90 dias com banda de confiança.

### Anomaly alerts proativos

- Daily cron 8h: query categorias com `SUM(abs(amount))` últimos 7d vs média 90d.
- Se desvio > 2 σ, dispara Telegram message: "⚠️ Você gastou R$ X em iFood essa semana, 3x sua média. Tudo bem?"
- User pode responder direto: "tudo bem" / "ajusta categoria" / "ignora 30 dias".

### Pix favoritos + QR scan

- Tabela `pix_favorites` (user_id, key_type: cpf|cnpj|email|phone|random, key, label, default_amount_cents, default_category_id).
- Web/Telegram: scan QR Pix → preenche form → vira transaction direto.
- Brasil-first feature (concorrentes não fazem).

### Investments tracker

- Tabela `investments` (user_id, asset_type: cdb|tesouro|stock|crypto|fund, label, broker, symbol, quantity, avg_cost_cents).
- Sync via API (B3 RTD limitado, CDB/Tesouro via scrape de XPi/Rico/Inter).
- Insight: rendimento composto, comparação vs CDI, IR provisão.

### Multi-moeda

- Coluna `currency` já existe nas tabelas chave.
- API de FX (open-rates ou banco BCB API) com cache 1h.
- Conversão automática para `default_currency` em agregações.

### Health × Wealth correlation

- Integração Apple Health via Shortcuts → endpoint privado.
- Métricas: HRV, sono (horas + qualidade), passos.
- Insight composto: "noites < 6h de sono coincidem com R$ X a mais em delivery".
- Privacy: dados health ficam em tabela separada, nunca passam por LLM por default (opt-in).

---

## 17. Horizon 4 — Dream (6-12+ meses)

**Tema:** ambição. Coisas que mudam o jogo. Algumas viram produto novo, outras feature flagship.

### Agendario for Teams

- Multi-user com roles (`owner`, `admin`, `member`, `accountant`).
- Casos de uso:
  - Clínica pequena: 3-5 médicos compartilhando agenda + financeiro.
  - Repúblicas/casas compartilhadas: divisão de despesas estilo Splitwise++.
  - Médicos em sociedade: caixa PJ separado de PF, repartição de lucros automatizada.
- Modelo: workspace tem múltiplos profiles linkados, transactions herdam workspace_id, splits automáticos por regra.

### Marketplace de plantões

- Quadro interno: "tenho plantão dia X 19-7 no hospital Y, vendo por R$ Z".
- Outros médicos verificados (CRM check) ofertam ou aceitam.
- Escrow no app: comprador paga, app retém, transfere após confirmação de troca de escala.
- Receita: 5% taxa.
- Network effect violento dentro da vertical médica.

### AI Financial Coach (agente)

- Chat conversacional baseado em Claude/GPT com tools que acessam DB.
- Capacidades:
  - "Quanto sobra esse mês se eu gastar igual ao mês passado?"
  - "Negocia comigo: quero comprar X de Y reais, é boa hora?"
  - "Simula PJ vs CLT pra próxima oferta de emprego."
  - "Como diminuir 20% gasto sem cortar minha qualidade de vida?"
- Diferencial: agente entende plantões, carnê-leão, vida real de médico — não é generic ChatGPT.

### Tax Optimizer Brasil

- Simulador automático: dado teu volume de RPA + PJ + holerite, calcula:
  - Carnê-leão mensal otimizado.
  - PJ vs CLT vs MEI vs cooperativa anual.
  - Quando vale abrir CNPJ próprio.
  - Pró-labore vs distribuição de lucros (split otimizado).
- Output: relatório PDF + plano de ação.

### MCP server público

- Expor endpoints MCP (Model Context Protocol) para que outros agents (Claude Desktop, Cursor) consultem dados do user com OAuth.
- Use cases:
  - User pergunta no Claude Desktop: "qual minha taxa de poupança?" → Claude consulta MCP do Agendario.
  - Outros apps integram (Granola.ai, Notion, Linear).
- Posiciona Agendario como **fonte de verdade financeira** consumível por qualquer IA.

### Receipt OCR offline-first

- Processamento on-device em iOS via VisionKit + Core ML.
- Privacy-first: cliente médico/contador não passa por servidor.
- Diferencial regulatório (LGPD-friendly por construção).

### Open API pra contadores

- OAuth 2.0 PKCE para apps de terceiros (contadores, accounting software).
- Scopes granulares: `read:transactions`, `read:carne_leao`, `read:invoices`.
- Contadores acessam via dashboard próprio sem precisar pedir CSV ao cliente todo mês.
- Receita: B2B (R$ 50-100/mês por contador, escalável).

### Local-first option

- Postgres local via Electric SQL ou PowerSync.
- Replica encrypted no Supabase.
- Offline-first: app funciona em avião, sincroniza quando volta.
- Diferencial pra usuários paranoicos com privacy.

### Voice capture

- WhatsApp/Telegram voice → Whisper API → transcrição → mesmo pipeline LLM.
- Use case real: médico saindo de plantão, pega Uber, fala "gastei 38 no uber 3 minutos atrás", pronto.

### Family mode

- Cônjuge tem app espelhado.
- Splits automáticos por regra ("aluguel sempre 50/50").
- Visão familiar consolidada vs visão individual.
- Conflict resolution: cada parte aprova transactions compartilhadas.

### B2B SaaS pra hospitais

- Inverter o modelo: hospital paga subscription pra gerenciar escala + pagamento médicos.
- Médicos têm app gratuito que conecta automaticamente ao hospital cliente.
- Hospital vê: quem está disponível, quem foi pago, faturamento individual, IR retido.
- Receita potencial: R$ 5-10k/hospital/mês, mercado de ~6000 hospitais brasileiros.

### Spending memes / personalidade

- Insights com tom: "esse mês você foi um Café Café Café energúmeno: R$ 340 só em café, parabéns/parabéns?".
- Achievements: "10 plantões seguidos sem iFood — você é um deus".
- Diferencial emocional. Nubank fez isso bem; Mobills é cinza.

### Apple Watch complications

- Saldo + próximo plantão como complication.
- Glance no pulso enquanto corre pro hospital.
- Implementação: SwiftUI app companion + endpoint público com magic link.

### Partner mode (banks rebate)

- Parcerias com bancos digitais (Inter, Nubank, C6) para rebate por cliente que abre conta via Agendario.
- Receita complementar.
- Diferencial: somos vertical médica, podemos negociar produtos médicos (ex: cartão com cashback em farmácia).

### Sustentabilidade financeira

- **Modelo open-core:** core gratuito (single-user, dashboard, captura, OCR básico).
- **Pro tier (R$ 29-49/mês):** insights LLM, sync banking, multi-conta, carnê-leão export.
- **Teams (R$ 99/seat/mês):** clínicas, sociedades.
- **B2B Hospital (custom):** SaaS.
- **API de contador:** B2B.
- Marketplace de plantões: 5% take rate.
- LLM costs ~R$ 5/user/mês ativo. Margem brutal em Pro.

---

## 18. Princípios estratégicos

### O que NÃO fazer

- **NÃO virar genérico.** Vertical médico é nossa fortaleza. Pessoa não-médica pode usar, mas marketing/UX é médico-first sempre.
- **NÃO copiar Mobills.** Eles são bons mas chatos. Foco em design moderno (Copilot Money) + workflow LLM (não existe nada igual).
- **NÃO depender de TPP cedo.** Open Finance é roadmap, não MVP. CSV/foto resolvem 80% dos casos com 0% de regulação.
- **NÃO over-engineer.** Drizzle + RSC + Inngest é o suficiente. Não trocar por GraphQL/tRPC/microservices.

### O que SIM fazer

- **Privacy by default.** Dados de saúde nunca sobem pra LLM sem opt-in explícito.
- **Brasil-first.** Pix, carnê-leão, Telegram, BRL primary, América/Recife default.
- **LLM como interface, não decorativo.** Captura, parse, insight — não chatbot inútil.
- **Mobile-first, mas desktop bonito.** Médico usa celular no plantão e desktop no consultório.
- **Speed > polish em features novas.** Lançar feio e iterar com user real (Luiz é o user/dev — feedback loop de minutos).

### Métricas de sucesso

| Métrica | Hoje | 3 meses | 12 meses |
|---|---|---|---|
| Usuários ativos | 1 (Luiz) | 10-50 (médicos amigos) | 500-2000 (organic + boca-boca) |
| Transações capturadas / dia / user | ~5 | ~10 | ~15 |
| % captura via Telegram (vs web) | 70% | 70% | 60% (diversifica web + voice) |
| Tempo médio entre evento real e captura | <5min | <2min | <30s |
| % transações auto-categorizadas com confiança ≥0.8 | ~60% | ~80% | ~92% |
| MRR (se monetizar Q3) | R$ 0 | R$ 0 | R$ 5-15k |

### Riscos a monitorar

- **Custo LLM escalando:** vision a R$ 0.15/fatura × 1000 users × 5 faturas/mês = R$ 750/mês. Aceitável até ~5k users; depois precisa fine-tune próprio.
- **Telegram banido/instável:** ter fallback WhatsApp pronto (Twilio Messaging API ou Z-API).
- **Supabase pricing change:** começar com self-hosted Postgres backup mental.
- **Concorrente vertical médica copia:** Doctoralia, iClinic, etc — improvável (eles são EHR, não financeiro). Nubank fazendo PF + agenda — também improvável (escopo deles).
- **Regulação:** carnê-leão export pode atrair atenção da Receita. Fazer disclaimer "informativo, não substitui contador".

---

## Conclusão

Agendario está em **momento raro** de produto: stack moderna sem dívida estrutural, domain model bem pensado, primeiros features (dashboard, OCR, GCal sync, expense templates) funcionando end-to-end. Os próximos 3 meses fecham o produto core (settings, insights, carnê-leão, multi-página PDF), os próximos 6 meses diferenciam (cashflow IA, anomaly alerts, Pix favoritos), e a partir daí o roadmap "dream" abre frentes ambiciosas — algumas viram features, outras viram produtos novos.

**A oportunidade real é vertical médica + IA nativa + Brasil-first.** Nenhum concorrente tem os três simultaneamente.
