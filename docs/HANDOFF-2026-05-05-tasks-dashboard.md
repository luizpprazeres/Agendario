# Handoff: Tasks no /dashboard (bloco "Hoje")

**Data:** 2026-05-05
**Status:** aguardando início — depende de Cartões mergeada (mesmo `dashboard/page.tsx`)
**Para:** terminal "agenda" (Claude Code)

---

## 1. Objetivo

Adicionar um bloco **"Hoje"** no `/dashboard` mostrando tasks pendentes (`todo` ou `in_progress`) com vencimento hoje ou atrasadas. Permite **marcar como feita inline** via checkbox (server action). Sem criar UI de criação/edição — captura via Telegram já existe.

**Por que importa:** o app captura tasks via bot ("estudar paper sepse 30min"), mas hoje elas vão pro DB e ninguém vê. Bloco "Hoje" no dashboard fecha o loop — você bate olho no dashboard, vê o que precisa fazer, marca quando termina.

**Escopo MVP:**
- Query: tasks status `todo` ou `in_progress` com `due_at <= end-of-today` OR `scheduled_start <= end-of-today`
- Limit 6
- Display: checkbox (toggle done), título, badge prioridade (urgent vermelho/high amber), opcional duração estimada, hospital se workplace_id
- Server action `toggleTaskDone(taskId)` — marca `status='done'` + `completed_at=now()` (ou reverte se já done)
- Posição: **após "Próximo plantão"** e antes de "Onde foi"
- Empty state: "Tudo em dia ✓"

**Fora de escopo:**
- Criação/edição de tasks na web (captura via Telegram)
- Time blocking visual (calendar view)
- Subtasks / parent_task_id rendering
- Tags filter
- Drag-drop reorder

---

## 2. Contexto essencial

### Pré-requisitos
- Cartões de crédito **mergeada** (último commit do agenda em `dashboard/page.tsx`)
- `git pull origin main` antes de começar

### Schema já existe
`packages/db/src/schema/tasks.ts`:
- `status: 'todo' | 'in_progress' | 'done' | 'cancelled' | 'deferred'`
- `priority: 'low' | 'medium' | 'high' | 'urgent'`
- `due_at: timestamp` (com TZ) — quando precisa estar pronto
- `scheduled_start, scheduled_end: timestamp` — time blocking (opcional)
- `estimated_minutes: integer`
- `completed_at: timestamp`
- `workplace_id: uuid` (opcional — task vinculada a hospital)
- `tags: jsonb` (array de strings)

### Captura via Telegram já implementada
`apps/web/src/lib/inngest/functions/confirm-inbox-item.ts` case `"task"` — cria tasks com `status='todo'`, `priority='medium'` default, `due_at` opcional.

### Padrões obrigatórios
- Estilo Native (já aplicado): rounded-3xl, oklch warm, tabular-nums em durações
- Português UI, sem emojis em código (pode ter ícone Lucide via SVG inline)
- Server action no mesmo arquivo `dashboard/page.tsx` (consistente com `signOut`)
- `revalidatePath("/dashboard")` após toggle
- Truncate em título com `min-w-0 flex-1`

---

## 3. Próximos passos (ordem)

### 3.1. Pull + verificar pré-requisitos

```bash
git pull origin main
# Confirmar que último commit é 'feat: credit card tracking + dashboard block'
git log --oneline -5
```

### 3.2. Adicionar query em `loadDashboard`

No `dashboard/page.tsx`, adicionar import de `tasks` em `@agendario/db` e query:

```ts
import { tasks } from "@agendario/db";
import { inArray, lte, or } from "drizzle-orm";  // se não tiver

// dentro de loadDashboard, calcular fim do dia em America/Recife
const endOfTodayRecife = (() => {
  // Pega o início do próximo dia em Recife (start_of_tomorrow), e subtrai 1ms
  // ou simplesmente usa "<= próximo midnight Recife"
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(new Date());
  // "2026-05-05" → end of day em UTC: 2026-05-06T03:00:00Z (Recife = UTC-3)
  // Conservador: usa fim de domínio do dia em UTC, +24h pra cobrir TZ
  const startOfTodayUtc = new Date(`${today}T03:00:00.000Z`);
  return new Date(startOfTodayUtc.getTime() + 24 * 60 * 60 * 1000);
})();

const todayTasks = await db
  .select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    due_at: tasks.due_at,
    scheduled_start: tasks.scheduled_start,
    estimated_minutes: tasks.estimated_minutes,
    completed_at: tasks.completed_at,
    workplace_id: tasks.workplace_id,
  })
  .from(tasks)
  .where(
    and(
      eq(tasks.user_id, userId),
      inArray(tasks.status, ["todo", "in_progress"]),
      or(
        lte(tasks.due_at, endOfTodayRecife),
        lte(tasks.scheduled_start, endOfTodayRecife)
      )
    )
  )
  .orderBy(asc(tasks.due_at), asc(tasks.scheduled_start))
  .limit(6);
```

Retornar no objeto:
```ts
return { ..., todayTasks };
```

### 3.3. Server action: toggle done

No `dashboard/page.tsx`, próximo a `signOut`:

```ts
async function toggleTaskDone(formData: FormData) {
  "use server";
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDb();

  // Carrega pra saber estado atual + validar ownership
  const [current] = await db
    .select({ status: tasks.status, completed_at: tasks.completed_at })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.user_id, user.id)))
    .limit(1);
  if (!current) return;

  const isCompleting = current.status !== "done";

  await db
    .update(tasks)
    .set({
      status: isCompleting ? "done" : "todo",
      completed_at: isCompleting ? new Date() : null,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.user_id, user.id)));

  revalidatePath("/dashboard");
}
```

Adicionar import: `import { revalidatePath } from "next/cache";`

### 3.4. Renderizar bloco "Hoje"

**Posição:** logo após o card "Próximo plantão" (`{next ? (...) : null}`), antes de "Top categorias".

**Layout sugerido:**

```tsx
{todayTasks.length > 0 ? (
  <section
    className="rounded-3xl border p-5 sm:p-6"
    style={{
      background: "oklch(0.21 0.007 30)",
      borderColor: "oklch(0.245 0.008 30)",
    }}
  >
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-base font-medium" style={{ fontStretch: "94%" }}>
        Hoje
      </h2>
      <p className="text-xs" style={{ color: "oklch(0.55 0.006 30)" }}>
        {todayTasks.length} {todayTasks.length === 1 ? "tarefa" : "tarefas"}
      </p>
    </div>
    <ul className="space-y-2">
      {todayTasks.map((task) => {
        const isOverdue =
          task.due_at !== null && new Date(task.due_at) < new Date();
        const priorityColor =
          task.priority === "urgent"
            ? "oklch(0.74 0.16 25)"
            : task.priority === "high"
              ? "oklch(0.78 0.14 80)"
              : task.priority === "low"
                ? "oklch(0.45 0.005 30)"
                : "oklch(0.7 0.006 30)";
        const dueLabel = task.scheduled_start
          ? new Intl.DateTimeFormat("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Recife",
            }).format(new Date(task.scheduled_start))
          : task.due_at
            ? "vence hoje"
            : null;
        return (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
            style={{
              background: "oklch(0.245 0.008 30)",
              borderColor: "oklch(0.28 0.008 30)",
            }}
          >
            <form action={toggleTaskDone}>
              <input type="hidden" name="task_id" value={task.id} />
              <button
                type="submit"
                className="grid size-5 shrink-0 place-items-center rounded-md border transition"
                style={{
                  borderColor: priorityColor,
                  background: "transparent",
                }}
                aria-label="Marcar como feita"
              >
                {/* checkbox vazio até clicar */}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{task.title}</p>
              {dueLabel || task.estimated_minutes ? (
                <p
                  className="truncate text-[11px]"
                  style={{
                    color: isOverdue
                      ? "oklch(0.74 0.16 25)"
                      : "oklch(0.55 0.006 30)",
                  }}
                >
                  {isOverdue ? "atrasada · " : ""}
                  {dueLabel ?? ""}
                  {dueLabel && task.estimated_minutes ? " · " : ""}
                  {task.estimated_minutes ? `${task.estimated_minutes}min` : ""}
                </p>
              ) : null}
            </div>
            {task.priority === "urgent" || task.priority === "high" ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: priorityColor }}
                aria-label={`prioridade ${task.priority}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  </section>
) : null}
```

**ATENÇÃO TRUNCATE:** título pode ser longo ("Estudar paper sepse fluido balanceado vs salina 0,9%"). `truncate min-w-0 flex-1` no parent.

**Empty state opcional:** se quiser mostrar bloco mesmo quando vazio com mensagem "Tudo em dia ✓", remover `{todayTasks.length > 0 ? (...) : null}` e adicionar fallback. Decisão estética sua.

### 3.5. Validar visualmente

- `pnpm dev:web`
- Abrir `/dashboard` autenticado
- Verificar:
  - Bloco aparece se tem tasks pendentes
  - Checkbox toggle funciona (clicar marca como done, página atualiza, task some)
  - Atrasadas mostram "atrasada · ..." em vermelho
  - Prioridade urgent/high mostra bullet colorido na direita
  - Truncate em títulos longos
- Se não tiver task seedada, criar uma manualmente via SQL ou via Telegram

### 3.6. Commit + push como @devops

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat: today tasks block on /dashboard"
git push origin main
```

Mensagem completa:
```
feat: today tasks block on /dashboard

Adds a "Hoje" block listing pending tasks (status todo/in_progress)
due today or overdue. Inline checkbox toggle via server action marks
task as done with completed_at=now(). Priority urgent/high get a
colored bullet on the right; overdue tasks render in red. Limit 6
ordered by due_at then scheduled_start.

Block positioned after "Próximo plantão" and before "Onde foi".
Task creation remains via Telegram bot (out of scope here).
```

---

## 4. Perguntas em aberto

1. **Mostrar mesmo se vazio?** Default: omitir (`{length > 0 ? ... : null}`). Alternativa: sempre mostrar com "Tudo em dia ✓". Sugestão: omitir — empty é o estado normal e poluiria.
2. **Subtasks (parent_task_id)?** Não no MVP. Se task tem subtasks, mostrar contador "3 subtasks" só visualmente. Adicionar em fase 2.
3. **Tags visíveis?** Não no MVP. Adicionar como pill pequena depois se demandado.
4. **Future tasks (não hoje, mas próximas 48h)?** Não — bloco se chama "Hoje" e foca aí. Se quiser "próximas", criar bloco separado depois.
5. **GCal sync das tasks time-blocked?** Schema suporta (gcal_event_id já existe), mas implementação é fora do escopo — paralelo do que foi feito pra shifts.

---

## 5. Artefatos relevantes

### Arquivos a editar
- `apps/web/src/app/dashboard/page.tsx` — adicionar import, query, server action, bloco JSX

### Schemas referência
- `packages/db/src/schema/tasks.ts` — shape completo
- `packages/db/src/schema/_shared.ts` — `taskStatusEnum` (todo | in_progress | done | cancelled | deferred), `taskPriorityEnum` (low | medium | high | urgent)

### Helpers Drizzle adicionais
```ts
import { inArray, lte, or } from "drizzle-orm";
```

### Comandos úteis
```bash
pnpm dev:web
pnpm --filter @agendario/web exec tsc --noEmit

# Criar task de teste manualmente
psql "$DATABASE_URL" -c "INSERT INTO tasks (user_id, title, status, priority, due_at) VALUES ('90f145e7-46bf-46fb-8425-ad633e3d7535', 'Pagar fatura Nubank', 'todo', 'high', NOW())"
```

---

## 6. Instruções de tom

- Conciso, português, sem preâmbulo
- Validar visualmente antes de commit
- @devops pra git push (autorizado)
- Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

### Armadilhas
- `due_at` é timestamp com TZ — em JS chega como Date OU string dependendo do driver. Testar com `new Date(task.due_at)`.
- `scheduled_start` mesma coisa
- TZ de Recife (UTC-3): cuidado em borda de meia-noite. Use `endOfTodayRecife` calculado server-side
- `tasks.priority` é enum strict — não comparar com strings arbitrárias
- Server action `formData.get("task_id")` retorna `FormDataEntryValue | null` — converter pra string com fallback
- Truncate com `min-w-0 flex-1`
- `revalidatePath("/dashboard")` é OBRIGATÓRIO — sem ele, página fica cacheada após toggle
- `force-dynamic` já está setado no page

---

**Pronto pra executar APÓS Cartões mergeada.** Comece por 3.1 (pull). Single-file change — escopo enxuto.
