# Agendario

Workspace pessoal médico + financeiro. Mobile-first, captura por Telegram com parsing LLM, sync bidirecional com Google Calendar.

## Stack

- **Monorepo** pnpm workspaces
- **Web:** Next.js 15 (App Router) + Tailwind + Supabase Auth/DB
- **Bot:** grammY (long-polling em dev, webhook em prod)
- **DB:** Postgres (Supabase) + Drizzle ORM
- **Jobs:** Inngest
- **LLM:** OpenAI (gpt-4o-mini para parse/categorização, gpt-4o para insights)

## Estrutura

```
agendario/
├── apps/
│   ├── web/      # Next.js 15 + UI + API routes
│   └── bot/      # Telegram bot (grammY) — long-polling em dev
├── packages/
│   └── db/       # Schema Drizzle compartilhado
├── .env.local    # Variáveis de ambiente (gitignored)
└── .env.example  # Template
```

## Setup local — Fase 0

### Pré-requisitos

- Node 20+
- pnpm 10+
- Docker Desktop rodando (para Supabase local)
- Supabase CLI

### Passos

```bash
# 1. Instalar dependências
pnpm install

# 2. Iniciar Supabase local (Postgres + Auth + Storage)
supabase init   # apenas na primeira vez
supabase start
# → copia API URL, anon key, service_role key e DB URL para .env.local

# 3. Gerar e aplicar schema
pnpm db:generate
pnpm db:migrate

# 4. Iniciar tudo (em terminais separados):
pnpm dev:web        # Next.js → http://localhost:3000
pnpm dev:bot        # Bot Telegram em polling
pnpm dev:inngest    # Inngest dev server → http://localhost:8288

# Ou tudo de uma vez:
pnpm dev
```

## Roadmap

Ver plano técnico completo na sessão de design — fases F0 → F4.
