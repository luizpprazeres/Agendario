export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Agendario</h1>
        <p className="text-sm text-zinc-400">
          Workspace médico + financeiro. Mobile-first. Captura por Telegram.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">
          Status do bootstrap (Fase 0)
        </h2>
        <ul className="space-y-1.5 text-sm text-zinc-400">
          <Step label="Monorepo pnpm" done />
          <Step label="Schema Drizzle (packages/db)" done />
          <Step label="apps/web (Next.js 15)" done />
          <Step label="apps/bot (grammY)" done />
          <Step label="Supabase local rodando" pending />
          <Step label="Migrations aplicadas" pending />
          <Step label="OpenAI API key configurada" pending />
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Próximos passos</h2>
        <ol className="ml-4 list-decimal space-y-1 text-sm text-zinc-400">
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              supabase start
            </code>{" "}
            e copiar credenciais para <code>.env.local</code>
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              pnpm db:generate && pnpm db:migrate
            </code>
          </li>
          <li>
            Aplicar policies RLS (próximo artefato)
          </li>
          <li>
            Configurar <code>OPENAI_API_KEY</code>
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              pnpm dev
            </code>{" "}
            (web + bot + inngest)
          </li>
        </ol>
      </section>
    </main>
  );
}

function Step({ label, done = false, pending = false }: {
  label: string;
  done?: boolean;
  pending?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          done
            ? "text-emerald-400"
            : pending
              ? "text-amber-400"
              : "text-zinc-500"
        }
      >
        {done ? "✓" : pending ? "○" : "·"}
      </span>
      <span className={done ? "text-zinc-200" : "text-zinc-400"}>{label}</span>
    </li>
  );
}
