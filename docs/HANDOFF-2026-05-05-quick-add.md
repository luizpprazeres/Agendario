# Handoff: Quick Add web (captura natural-language no dashboard)

**Data:** 2026-05-05
**Status:** aguardando início — depende de Subscriptions + Bills estarem mergeadas (mesmo arquivo `dashboard/page.tsx`)
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Adicionar um **input natural-language** no topo do `/dashboard` que captura mensagens (mesmo formato do Telegram: "Gastei 150 no restaurante", "Plantão segunda 7-19h Einstein") e dispara a mesma pipeline já existente: parse via OpenAI → cria `inbox_item` → Inngest event `inbox/parse-requested` → confirma automaticamente OU vira pendente na Inbox pra revisar depois.

**Por que importa:** hoje toda captura precisa abrir o Telegram. Web = primeira tela onde o Luiz já está logado, sem fricção. Reaproveita 100% da pipeline já validada.

**Escopo MVP:** input + submit + criar inbox_item + disparar Inngest. Sem preview live, sem confirm/edit inline (esses ficam pra fase 2). Após submit, item vai pra processamento e aparece em "Atividade recente" quando Inngest terminar.

---

## 2. Contexto essencial

### Pipeline já existente (referenciar antes de codar)
- `apps/web/src/lib/openai/parse-intent.ts` — função que faz parse via `client.beta.chat.completions.parse` e retorna discriminated union
- `apps/web/src/lib/inngest/functions/parse-inbox-item.ts` — Inngest function que escuta `inbox/parse-requested`
- `apps/web/src/lib/inngest/client.ts` — `inngest.send({ name, data })`
- `apps/web/src/app/api/webhooks/telegram/route.ts` — mostra como o bot cria inbox_item + dispara o Inngest event (modelo a copiar)
- Schema `inbox_items` em `packages/db/src/schema/inbox.ts` (já existe)

### Stack
- Next.js 15 server actions (no `"use client"` componente, no `"use server"` action)
- Drizzle direct + filtro user_id (padrão estabelecido)
- Estilo Native — botão verde emerald `oklch(0.85 0.16 155)` com texto escuro

### Pré-requisitos
- Subscriptions e Bills já mergeadas (eles tocam em `dashboard/page.tsx`)
- `git pull origin main` antes de começar

---

## 3. Próximos passos (ordem)

### 3.1. Verificar pré-requisitos

```bash
git log --oneline -7
# Deve ter "feat: subscriptions ..." e "feat: bills ..." nos últimos commits
git pull origin main
```

### 3.2. Ler o webhook do bot pra copiar a pipeline

```bash
# Ler atentamente, observar como cria inbox_item + envia Inngest event
cat apps/web/src/app/api/webhooks/telegram/route.ts
```

Identificar:
1. Como o bot chama `getDb().insert(inboxItems).values(...)`
2. Qual evento Inngest dispara (`inbox/parse-requested`?)
3. Quais campos preenche em `inbox_items` (raw_text, source, status, etc.)

### 3.3. Criar componente `QuickAddInput`

Criar `apps/web/src/components/quick-add-input.tsx`:

```tsx
"use client";

import { useTransition, useState } from "react";

const PLACEHOLDERS = [
  "Gastei 150 no restaurante ontem…",
  "Plantão segunda 7-19h Einstein…",
  "Comprei combustível 312 reais Shell…",
  "Lembrete pagar fatura sexta…",
  "Recebi reembolso 380 do plano…",
];

export function QuickAddInput({
  action,
}: {
  action: (text: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const placeholder =
    PLACEHOLDERS[Math.floor(Date.now() / 8000) % PLACEHOLDERS.length];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    startTransition(async () => {
      const res = await action(value);
      setFeedback(
        res.ok
          ? `Capturando: "${value.slice(0, 40)}${value.length > 40 ? "…" : ""}"`
          : res.message ?? "Falha ao capturar."
      );
      setTimeout(() => setFeedback(null), 4000);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div
        className="flex items-center gap-2 rounded-2xl border px-3 py-2"
        style={{
          background: "oklch(0.21 0.007 30)",
          borderColor: "oklch(0.28 0.008 30)",
        }}
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg"
          style={{
            background: "oklch(0.85 0.16 155 / 0.18)",
            color: "oklch(0.85 0.16 155)",
          }}
          aria-hidden
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={isPending}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-60"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim() || isPending}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
          style={{
            background: "oklch(0.85 0.16 155)",
            color: "oklch(0.2 0.04 155)",
          }}
        >
          {isPending ? "…" : "Capturar"}
        </button>
      </div>
      {feedback ? (
        <p
          className="px-3 text-[11px]"
          style={{ color: "oklch(0.7 0.006 30)" }}
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
```

### 3.4. Criar server action `captureFromText`

No `apps/web/src/app/dashboard/page.tsx` (mesmo arquivo, próximo ao `signOut`):

```ts
async function captureFromText(text: string) {
  "use server";

  const trimmed = text.trim();
  if (!trimmed) return { ok: false as const, message: "Texto vazio." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Não autenticado." };

  const db = getDb();

  const [item] = await db
    .insert(inboxItems)
    .values({
      user_id: user.id,
      source: "web",
      raw_text: trimmed,
      status: "pending",
    })
    .returning({ id: inboxItems.id });

  if (!item) return { ok: false as const, message: "Falha ao criar item." };

  // Dispara Inngest event — mesma pipeline do bot Telegram
  await inngest.send({
    name: "inbox/parse-requested",
    data: { inbox_item_id: item.id },
  });

  revalidatePath("/dashboard");
  return { ok: true as const };
}
```

**Atenção:** confirmar o nome exato do evento Inngest (`inbox/parse-requested` ou outro) lendo `apps/web/src/lib/inngest/functions/parse-inbox-item.ts`. Usar EXATAMENTE o nome que está lá.

**Atenção schema:** confirmar campos de `inbox_items` em `packages/db/src/schema/inbox.ts` — pode ser que `source` aceite enum específico (verificar se "web" é valor válido ou se precisa ajustar enum/coluna).

### 3.5. Renderizar no dashboard

Adicionar no JSX, **logo após o `<header>`** e antes do primeiro `<section>`:

```tsx
<div className="px-4 sm:px-6">
  <QuickAddInput action={captureFromText} />
</div>
```

Imports necessários no top do `page.tsx`:
```ts
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { inboxItems } from "@agendario/db";
import { QuickAddInput } from "@/components/quick-add-input";
```

### 3.6. Validar visualmente + funcionalmente

- `pnpm dev:web` em background
- Abrir `/dashboard` autenticado
- Digitar "Gastei 50 no almoço hoje" + Enter
- Confirmar:
  - Feedback inline aparece ("Capturando: ...")
  - Inngest dashboard (`http://localhost:8288`) mostra evento recebido
  - Após 5-15s, transação aparece em "Atividade recente" (refresh da página pode ser necessário)
- Testar 2-3 frases diferentes (despesa, plantão, task)
- **Empty submit:** botão deve estar desabilitado se input vazio

### 3.7. Commit + push como @devops

Após aprovação:
```bash
git add apps/web/src/components/quick-add-input.tsx \
        apps/web/src/app/dashboard/page.tsx

git commit -m "feat: quick-add input on /dashboard"
git push origin main
```

Mensagem:
```
feat: quick-add input on /dashboard

Adds a natural-language input at the top of the dashboard that creates
an inbox_item with source='web' and dispatches inbox/parse-requested,
reusing the same Inngest pipeline already validated for Telegram.

MVP: submit + feedback inline. Item appears in "Atividade recente"
once Inngest finishes parsing + confirming. Live preview and inline
edit/confirm are phase 2.
```

---

## 4. Perguntas em aberto

1. **Auto-confirm ou manter pending?** Pipeline atual do bot mostra preview e pede clique pra confirmar. Web no MVP **dispara direto** porque não tem botão. Risco: parses errados criam transactions ruins. Mitigação: parse-inbox-item já tem confidence threshold. Se confidence baixa, status fica "pending" e vai pra Inbox manual. **Não inventar lógica nova** — usar exatamente o que parse-inbox-item já faz.
2. **`source` enum aceita "web"?** Ler schema. Se for enum strict, **adicionar valor**. Se for text, ok como está.
3. **Atalho keyboard "N"?** Fora do escopo MVP. Adicionar depois quando o input for revisitado pra preview live.
4. **Voice input (mobile)?** Fora do escopo. iOS/Android nativos já tem dictado no teclado — basta o input ser `<input>` normal.

---

## 5. Artefatos relevantes

### Arquivos a criar
- `apps/web/src/components/quick-add-input.tsx` — primeiro componente em `components/`. Se a convenção for outra (ex: `apps/web/src/app/_components/`), siga a do projeto (verificar antes).

### Arquivos a editar
- `apps/web/src/app/dashboard/page.tsx` — adicionar import, server action, render

### Arquivos a LER (não editar)
- `apps/web/src/app/api/webhooks/telegram/route.ts` — modelo de pipeline
- `apps/web/src/lib/inngest/functions/parse-inbox-item.ts` — confirmar nome do evento
- `packages/db/src/schema/inbox.ts` — confirmar shape de `inbox_items` + valores válidos de `source`
- `apps/web/src/lib/inngest/client.ts` — confirmar export

### Comandos úteis
```bash
pnpm dev:web
pnpm dev:inngest    # terminal separado pra ver eventos chegando
pnpm --filter @agendario/web exec tsc --noEmit
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- Validar funcional E visualmente antes de commit (testar parse end-to-end)
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- Sem over-engineering — não implemente preview live, edit inline, atalhos. Tudo isso é fase 2.

### Armadilhas
- Server action dentro do mesmo arquivo precisa ser `async function` com `"use server"` no topo do corpo
- `revalidatePath("/dashboard")` é importante — sem isso a próxima refresh vai cachear
- `inboxItems.source` pode ser enum strict — confirmar antes
- Nome do evento Inngest tem que bater EXATAMENTE com o que `parse-inbox-item.ts` escuta
- `useTransition` evita layout shift durante pending
- Mona Sans + tabular-nums NÃO se aplicam aqui (input de texto, não números)
- Cuidado com truncate: o input é flex-1 min-w-0 e o botão shrink-0 — testar com texto longo

---

**Pronto pra executar APÓS Subscriptions + Bills mergeadas.** Comece pelo passo 3.1 (pull). Se travar em qualquer ponto (especialmente nome do evento Inngest), me chama via Maestri (terminal "main").
