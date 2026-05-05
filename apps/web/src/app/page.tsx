import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { serverEnv, clientEnv } from "@/env";

export const dynamic = "force-dynamic";

type Diagnostic = {
  db: { ok: boolean; tables: number; users: number; error?: string };
  rls: { ok: boolean; enabled: number; total: number };
  envs: {
    DATABASE_URL: boolean;
    OPENAI_API_KEY: boolean;
    TELEGRAM_BOT_TOKEN: boolean;
    GOOGLE_CLIENT_ID: boolean;
    SUPABASE_URL: boolean;
  };
};

async function runDiagnostic(): Promise<Diagnostic> {
  const envs = {
    DATABASE_URL: !!serverEnv.DATABASE_URL,
    OPENAI_API_KEY: !!serverEnv.OPENAI_API_KEY,
    TELEGRAM_BOT_TOKEN: !!serverEnv.TELEGRAM_BOT_TOKEN,
    GOOGLE_CLIENT_ID: !!serverEnv.GOOGLE_CLIENT_ID,
    SUPABASE_URL: !!clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  };

  const result: Diagnostic = {
    db: { ok: false, tables: 0, users: 0 },
    rls: { ok: false, enabled: 0, total: 0 },
    envs,
  };

  if (!envs.DATABASE_URL) return result;

  try {
    const db = getDb();

    const tablesRes = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname='public'`
    );
    const usersRes = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM auth.users`
    );
    const rlsRes = await db.execute<{ enabled: string; total: string }>(
      sql`SELECT
            SUM(CASE WHEN rowsecurity THEN 1 ELSE 0 END)::text AS enabled,
            COUNT(*)::text AS total
          FROM pg_tables WHERE schemaname='public'`
    );

    const tablesRow = tablesRes[0];
    const usersRow = usersRes[0];
    const rlsRow = rlsRes[0];

    result.db = {
      ok: true,
      tables: tablesRow ? Number(tablesRow.count) : 0,
      users: usersRow ? Number(usersRow.count) : 0,
    };
    result.rls = {
      ok: !!rlsRow && Number(rlsRow.enabled) === Number(rlsRow.total),
      enabled: rlsRow ? Number(rlsRow.enabled) : 0,
      total: rlsRow ? Number(rlsRow.total) : 0,
    };
  } catch (err) {
    result.db.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export default async function HomePage() {
  const diag = await runDiagnostic();

  const allEnvsOk = Object.values(diag.envs).every(Boolean);
  const dbOk = diag.db.ok && diag.db.tables >= 22;
  const rlsOk = diag.rls.ok && diag.rls.total > 0;
  const hasUsers = diag.db.users > 0;

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
          Infraestrutura
        </h2>
        <ul className="space-y-1.5 text-sm">
          <Step
            label="Variáveis de ambiente"
            status={allEnvsOk ? "ok" : "warn"}
            detail={
              allEnvsOk
                ? "todas configuradas"
                : Object.entries(diag.envs)
                    .filter(([, v]) => !v)
                    .map(([k]) => k)
                    .join(", ") + " ausente(s)"
            }
          />
          <Step
            label="Database (Supabase Cloud)"
            status={dbOk ? "ok" : diag.db.error ? "error" : "warn"}
            detail={
              diag.db.error
                ? diag.db.error
                : `${diag.db.tables} tabelas em public`
            }
          />
          <Step
            label="RLS policies"
            status={rlsOk ? "ok" : "warn"}
            detail={`${diag.rls.enabled}/${diag.rls.total} tabelas com RLS`}
          />
          <Step
            label="Bot Telegram"
            status={diag.envs.TELEGRAM_BOT_TOKEN ? "ok" : "warn"}
            detail="long-polling em apps/bot"
          />
          <Step
            label="OpenAI"
            status={diag.envs.OPENAI_API_KEY ? "ok" : "warn"}
            detail="gpt-4o-mini para parse de intent"
          />
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">
          Onboarding
        </h2>
        <ul className="space-y-1.5 text-sm">
          <Step
            label="Usuário criado em auth.users"
            status={hasUsers ? "ok" : "todo"}
            detail={
              hasUsers
                ? `${diag.db.users} usuário(s)`
                : "Supabase Dashboard → Authentication → Add user"
            }
          />
          <Step
            label="Seed de categorias"
            status="todo"
            detail="pnpm db:seed:categories <USER_ID>"
          />
          <Step
            label="Conta financeira inicial"
            status="todo"
            detail="INSERT manual via SQL Editor"
          />
          <Step
            label="Telegram chat vinculado"
            status="todo"
            detail="INSERT em telegram_users"
          />
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Endpoints</h2>
        <ul className="space-y-1">
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              GET /api/health
            </code>
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              POST /api/webhooks/telegram
            </code>
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              GET/POST /api/inngest
            </code>
          </li>
          <li>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              GET /api/auth/google/callback
            </code>
            <span className="ml-2 text-xs text-amber-400">stub</span>
          </li>
        </ul>
      </section>
    </main>
  );
}

type StepStatus = "ok" | "warn" | "error" | "todo";

function Step({
  label,
  status,
  detail,
}: {
  label: string;
  status: StepStatus;
  detail?: string;
}) {
  const icon =
    status === "ok"
      ? "✓"
      : status === "error"
        ? "✗"
        : status === "warn"
          ? "○"
          : "·";
  const color =
    status === "ok"
      ? "text-emerald-400"
      : status === "error"
        ? "text-red-400"
        : status === "warn"
          ? "text-amber-400"
          : "text-zinc-500";
  const labelColor =
    status === "ok" ? "text-zinc-200" : "text-zinc-400";

  return (
    <li className="flex items-start gap-2">
      <span className={`${color} pt-0.5`}>{icon}</span>
      <div className="flex-1">
        <span className={labelColor}>{label}</span>
        {detail ? (
          <span className="ml-2 text-xs text-zinc-500">— {detail}</span>
        ) : null}
      </div>
    </li>
  );
}
