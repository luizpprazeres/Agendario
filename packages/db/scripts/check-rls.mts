import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// .env.local na raiz do monorepo (../../../ a partir deste arquivo)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
config({ path: envPath });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`❌ DATABASE_URL não carregada de ${envPath}`);
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname='public' ORDER BY tablename
  `;
  const policies = await sql<{ tablename: string; policyname: string }[]>`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' ORDER BY tablename, policyname
  `;
  const triggers = await sql<{ trigger_name: string; event_object_table: string; event_object_schema: string }[]>`
    SELECT trigger_name, event_object_table, event_object_schema
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public','auth')
    ORDER BY event_object_table, trigger_name
  `;

  const rlsEnabled = tables.filter(t => t.rowsecurity).length;
  const rlsDisabled = tables.filter(t => !t.rowsecurity);

  console.log(`\n📊 RLS Status: ${rlsEnabled}/${tables.length} tables enabled`);
  if (rlsDisabled.length) console.log(`   ⚠️  No RLS:`, rlsDisabled.map(t => t.tablename).join(", "));

  console.log(`\n🛡️  Policies (${policies.length}):`);
  const grouped: Record<string, number> = {};
  for (const p of policies) grouped[p.tablename] = (grouped[p.tablename] || 0) + 1;
  for (const [t, c] of Object.entries(grouped)) console.log(`   ${t}: ${c}`);

  console.log(`\n⚙️  Triggers (${triggers.length}):`);
  for (const t of triggers) console.log(`   ${t.event_object_schema}.${t.event_object_table} → ${t.trigger_name}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
