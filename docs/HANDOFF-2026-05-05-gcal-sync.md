# Handoff: Google Calendar sync (plantões)

**Data:** 2026-05-05
**Status:** aguardando início — independente do dashboard work, pode rodar em paralelo a Subs/Bills/QuickAdd/Cards
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Sincronizar **plantões (`shifts`) do Agendario para o Google Calendar do usuário** (one-way, App → GCal). Sync reverso (GCal → App) fica pra fase 2.

**Por que importa:** Luiz já mantém uma agenda profissional no Google Calendar. Sem sync, ele duplica trabalho. Com sync, capturando "Plantão segunda 7-19h Einstein" via Telegram, o evento aparece automaticamente no calendário dele em 5-10s.

**Escopo MVP:**
- OAuth flow funcional (settings page mínima `/conectar-google`)
- Tokens persistidos em tabela `integrations` (verificar se já existe)
- Inngest function que push shift → GCal evento
- Trigger: ao confirmar shift via Telegram (já existe `shifts/created` — adicionar novo handler)
- Token refresh automático
- Disconnect simples (revoga e limpa tokens)

**Fora de escopo:**
- Sync reverso (GCal → App)
- Multi-calendar (usar 1 calendário fixo escolhido pelo usuário)
- Cores customizadas por hospital (usar default de cada workplace.color mapeado pra cores GCal)
- Resolução de conflitos sofisticada — usar etag simples

---

## 2. Contexto essencial

### Já existe no codebase
- Schema `shifts.gcal_event_id`, `shifts.gcal_calendar_id`, `shifts.gcal_etag` (em `packages/db/src/schema/shifts.ts`)
- Stub: `apps/web/src/app/api/auth/google/callback/route.ts` (precisa virar real)
- Env vars (`apps/web/src/env.ts`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `confirm-inbox-item.ts` (Inngest function) já cria shifts a partir de inbox parsed

### Verificar antes de começar
- `packages/db/src/schema/integrations.ts` — provavelmente já tem tabela `integrations` ou similar pra OAuth tokens. **Ler antes** e adaptar.
- `apps/web/src/env.ts` — confirmar que GOOGLE_* vars estão validadas

### Stack a adicionar
- `googleapis` npm package (oficial)
- Migration SQL pra `integrations` se faltar campos

### Padrões obrigatórios
- Tokens **sempre criptografados em rest** (Supabase já criptografa em rest, mas adicionar coluna `encryption_version`)
- Refresh token NUNCA expor em logs
- Inngest functions com `step.run` pra idempotência
- Português UI

---

## 3. Próximos passos (ordem)

### 3.1. Inspeção e setup

```bash
git pull origin main
cat packages/db/src/schema/integrations.ts  # verificar shape atual
cat apps/web/src/app/api/auth/google/callback/route.ts  # ver stub
grep -r "googleapis" apps/web/package.json  # confirmar se já está instalado
```

### 3.2. Instalar dependência

```bash
pnpm --filter @agendario/web add googleapis
```

### 3.3. Schema `integrations` (verificar/expandir)

Se a tabela `integrations` já existir, garantir que tem (sob outro nome OK):
```ts
{
  id: idColumn(),
  user_id: userIdColumn(),
  provider: text("provider").notNull(),  // 'google'
  account_email: text("account_email"),
  access_token: text("access_token").notNull(),
  refresh_token: text("refresh_token"),
  scope: text("scope"),
  token_type: text("token_type").default("Bearer"),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  // Específicos Google
  default_calendar_id: text("default_calendar_id"),
  ...timestampsColumns(),
}
```

Indexes:
- `(user_id, provider)` UNIQUE — uma integração por provider por usuário

Se faltar campos, ALTER TABLE via Drizzle generate + migrate.

### 3.4. Helper Google client

Criar `apps/web/src/lib/google/client.ts`:

```ts
import { google } from "googleapis";
import { serverEnv } from "@/env";

export function getOAuth2Client() {
  if (
    !serverEnv.GOOGLE_CLIENT_ID ||
    !serverEnv.GOOGLE_CLIENT_SECRET ||
    !serverEnv.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Google OAuth env vars não configuradas.");
  }
  return new google.auth.OAuth2(
    serverEnv.GOOGLE_CLIENT_ID,
    serverEnv.GOOGLE_CLIENT_SECRET,
    serverEnv.GOOGLE_REDIRECT_URI
  );
}

export const GCAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];
```

### 3.5. Helper: load+refresh tokens

Criar `apps/web/src/lib/google/tokens.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations } from "@agendario/db";
import { getOAuth2Client } from "./client";

export async function getAuthorizedClient(userId: string) {
  const db = getDb();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.user_id, userId),
        eq(integrations.provider, "google")
      )
    )
    .limit(1);

  if (!integration) return null;

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: integration.access_token,
    refresh_token: integration.refresh_token ?? undefined,
    expiry_date: integration.expires_at?.getTime(),
  });

  // Auto-refresh listener
  client.on("tokens", async (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      await db
        .update(integrations)
        .set({
          access_token: tokens.access_token ?? integration.access_token,
          refresh_token: tokens.refresh_token ?? integration.refresh_token,
          expires_at: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : integration.expires_at,
        })
        .where(eq(integrations.id, integration.id));
    }
  });

  return { client, integration };
}
```

### 3.6. Page `/conectar-google` (settings mínima)

Criar `apps/web/src/app/conectar-google/page.tsx`:

Server component:
- Verifica se já tem integração ativa
- Se SIM: mostra "✓ Conectado como {email}" + lista calendários disponíveis pra escolher default + botão "Desconectar"
- Se NÃO: mostra botão "Conectar Google Calendar" que dispara redirect

Server actions:
- `startOAuth()` — gera URL de authorize via `client.generateAuthUrl({ scope: GCAL_SCOPES, access_type: "offline", prompt: "consent" })` e `redirect()` pra ela
- `disconnect()` — revoga via `client.revokeToken(access_token)` e DELETE do row de integrations
- `setDefaultCalendar(calendarId)` — UPDATE em integrations

Estilo Native (rounded-3xl, oklch warm).

### 3.7. Callback handler (substituir stub)

Reescrever `apps/web/src/app/api/auth/google/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { integrations } from "@agendario/db";
import { getOAuth2Client } from "@/lib/google/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/conectar-google?error=${error ?? "missing_code"}`, req.url)
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const oauth = getOAuth2Client();
  const { tokens } = await oauth.getToken(code);

  // Pegar email associado
  oauth.setCredentials(tokens);
  const userInfo = await google.oauth2({ version: "v2", auth: oauth }).userinfo.get();

  const db = getDb();

  // Upsert: 1 integration por user+provider
  await db
    .insert(integrations)
    .values({
      user_id: user.id,
      provider: "google",
      account_email: userInfo.data.email ?? null,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? null,
      scope: tokens.scope ?? null,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    })
    .onConflictDoUpdate({
      target: [integrations.user_id, integrations.provider],
      set: {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        account_email: userInfo.data.email ?? null,
      },
    });

  return NextResponse.redirect(new URL("/conectar-google?connected=1", req.url));
}
```

**Atenção:** importar `google` de `googleapis` no top.

### 3.8. Inngest function: push shift → GCal

Criar `apps/web/src/lib/inngest/functions/sync-shift-to-gcal.ts`:

```ts
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { shifts, workplaces } from "@agendario/db";
import { getAuthorizedClient } from "@/lib/google/tokens";

export const syncShiftToGcal = inngest.createFunction(
  { id: "sync-shift-to-gcal", retries: 3 },
  { event: "shifts/synced-to-gcal-requested" },
  async ({ event, step, logger }) => {
    const { shift_id } = event.data as { shift_id: string };

    const shift = await step.run("load-shift", async () => {
      const db = getDb();
      const [s] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.id, shift_id))
        .limit(1);
      return s ?? null;
    });

    if (!shift) {
      logger.warn("Shift not found", { shift_id });
      return { skipped: "shift_not_found" };
    }

    const auth = await step.run("load-auth", async () => {
      return await getAuthorizedClient(shift.user_id);
    });

    if (!auth || !auth.integration.default_calendar_id) {
      logger.warn("Google not connected or no default calendar", {
        user_id: shift.user_id,
      });
      return { skipped: "google_not_configured" };
    }

    const workplace = await step.run("load-workplace", async () => {
      const db = getDb();
      const [w] = await db
        .select()
        .from(workplaces)
        .where(eq(workplaces.id, shift.workplace_id))
        .limit(1);
      return w ?? null;
    });

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    const eventBody = {
      summary: shift.title ?? `Plantão · ${workplace?.name ?? ""}`.trim(),
      description: [
        workplace?.name ? `Local: ${workplace.name}` : null,
        shift.notes,
        shift.pay_cents
          ? `Pagamento: R$ ${(Number(shift.pay_cents) / 100).toFixed(2)}`
          : null,
        `\nCriado pelo Agendario · shift_id: ${shift.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: shift.starts_at.toISOString() },
      end: { dateTime: shift.ends_at.toISOString() },
      extendedProperties: {
        private: { agendario_shift_id: shift.id },
      },
    };

    const result = await step.run("upsert-event", async () => {
      if (shift.gcal_event_id) {
        // Update existing
        try {
          const r = await calendar.events.update({
            calendarId: auth.integration.default_calendar_id!,
            eventId: shift.gcal_event_id,
            requestBody: eventBody,
          });
          return r.data;
        } catch (err: unknown) {
          // Se evento foi deletado no GCal, recriar
          if ((err as { code?: number })?.code === 404 || (err as { code?: number })?.code === 410) {
            const r = await calendar.events.insert({
              calendarId: auth.integration.default_calendar_id!,
              requestBody: eventBody,
            });
            return r.data;
          }
          throw err;
        }
      } else {
        const r = await calendar.events.insert({
          calendarId: auth.integration.default_calendar_id!,
          requestBody: eventBody,
        });
        return r.data;
      }
    });

    await step.run("save-event-ref", async () => {
      const db = getDb();
      await db
        .update(shifts)
        .set({
          gcal_event_id: result.id ?? null,
          gcal_calendar_id: auth.integration.default_calendar_id!,
          gcal_etag: result.etag ?? null,
        })
        .where(eq(shifts.id, shift.id));
    });

    return { ok: true, event_id: result.id };
  }
);
```

Registrar em `apps/web/src/lib/inngest/functions/index.ts`:
```ts
import { syncShiftToGcal } from "./sync-shift-to-gcal";
// ...
export const functions = [..., syncShiftToGcal];
```

### 3.9. Disparar evento ao confirmar shift

No `confirm-inbox-item.ts`, depois de criar shift, adicionar:
```ts
await step.run("queue-gcal-sync", async () => {
  await inngest.send({
    name: "shifts/synced-to-gcal-requested",
    data: { shift_id: createdShift.id },
  });
});
```

(Verificar nome exato do evento — usar EXATAMENTE o que `syncShiftToGcal` escuta.)

### 3.10. (Opcional) Inngest function pra delete

```ts
// listener: shifts/deleted
// → calendar.events.delete(calendarId, gcal_event_id)
// → clear gcal_* fields
```

Pra MVP: pular se não houver delete no fluxo Telegram. Adicionar quando Tasks UI suportar delete.

### 3.11. UI: mostrar status de sync no dashboard (opcional)

Pequeno indicador em "Próximo plantão":
- Se `gcal_event_id` setado: ícone de calendário verde + "no Google"
- Se ausente: nada

Mantém-se sutil, sem complicar layout.

### 3.12. Testar end-to-end

1. `pnpm dev:web` + `pnpm dev:bot` + `pnpm dev:inngest`
2. Acessar `/conectar-google`, fluir OAuth
3. Selecionar calendário default
4. Mandar mensagem ao bot: "Plantão sexta 7h-19h Albert Einstein"
5. Confirmar via callback button
6. Inngest dashboard mostra `shifts/synced-to-gcal-requested` recebido
7. Conferir no Google Calendar que evento apareceu
8. Mexer em algo no shift (via SQL manual) → re-disparar evento → conferir update no GCal

### 3.13. Commit + push como @devops

```bash
git add packages/db/src/schema/integrations.ts \  # se editou
        apps/web/package.json apps/web/pnpm-lock.yaml \
        apps/web/src/lib/google/ \
        apps/web/src/app/conectar-google/ \
        apps/web/src/app/api/auth/google/callback/route.ts \
        apps/web/src/lib/inngest/functions/sync-shift-to-gcal.ts \
        apps/web/src/lib/inngest/functions/index.ts \
        apps/web/src/lib/inngest/functions/confirm-inbox-item.ts \
        packages/db/drizzle/

git commit -m "feat: google calendar one-way sync for shifts"
git push origin main
```

---

## 4. Perguntas em aberto

1. **Multi-calendar?** Usuário pode querer separar plantões e compromissos pessoais. **NÃO no MVP** — 1 calendário escolhido como default. Adicionar tabela `gcal_calendar_mapping` em fase 2 (workplace → calendar).
2. **Cores por hospital?** GCal tem 11 colorIds. Mapear `workplace.color` (oklch) pra colorId mais próximo? **Adiar** — usar default. Implementar depois com `lib/google/colors.ts`.
3. **Sync reverso (GCal → App)?** Push notifications via webhook (`calendar.events.watch`) ou polling. Push é mais limpo mas requer URL pública (impede dev local sem ngrok). **Adiar** pra fase 2.
4. **Conflict resolution?** Se usuário edita evento no GCal e também no App, qual ganha? MVP: **App ganha** (overwrite via update). Fase 2: usar etag pra detectar conflitos e perguntar.
5. **Deletar shift remove evento?** Sim, mas precisa schema/ação pra "delete shift". Não existe ainda. **Adiar** com TODO.

---

## 5. Artefatos relevantes

### Arquivos a criar
- `apps/web/src/lib/google/client.ts`
- `apps/web/src/lib/google/tokens.ts`
- `apps/web/src/app/conectar-google/page.tsx`
- `apps/web/src/lib/inngest/functions/sync-shift-to-gcal.ts`

### Arquivos a editar
- `packages/db/src/schema/integrations.ts` (se faltar campos)
- `apps/web/src/app/api/auth/google/callback/route.ts` (substituir stub)
- `apps/web/src/lib/inngest/functions/confirm-inbox-item.ts` (disparar evento após criar shift)
- `apps/web/src/lib/inngest/functions/index.ts` (registrar nova function)
- `apps/web/package.json` (add `googleapis`)

### Setup externo necessário (FORA do código)
- Google Cloud Console: ativar Calendar API
- OAuth consent screen configurado (External, em desenvolvimento, scopes mínimos)
- OAuth Client ID criado com:
  - Type: Web application
  - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
- Credenciais copiadas pra `.env.local`:
  ```
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
  ```

**Confirmar com o usuário antes:** ele já fez esse setup ou precisa fazer? Se já fez, secrets devem estar no `.env.local`. Se não, **PARE** e peça pra ele criar antes de continuar.

### Comandos úteis
```bash
pnpm --filter @agendario/web add googleapis
pnpm db:generate && pnpm db:migrate
pnpm dev  # inicia web + bot
pnpm dev:inngest  # terminal separado
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- **NÃO logar tokens** em nenhum console
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

### Armadilhas
- `getAuthorizedClient` deve ser chamado dentro de `step.run` na Inngest function pra rodar uma vez só (cache do Inngest)
- Token refresh é via event listener — garantir que o UPDATE no DB é awaited
- Em dev, redirect URI é `http://localhost:3000/...`. Em prod, será diferente — env var existe pra isso
- `extendedProperties.private.agendario_shift_id` é a chave pra detectar eventos vindos do App (será útil pro sync reverso na fase 2)
- Se `default_calendar_id` for null, pular sync silenciosamente (não erro)
- Idempotência: se evento já tem `gcal_event_id`, fazer UPDATE (não INSERT) — evita duplicatas em retries

---

**Pronto pra executar.** Comece por 3.1 (inspeção). Se faltar credenciais Google, **PARE** antes de codar e avise via Maestri.
