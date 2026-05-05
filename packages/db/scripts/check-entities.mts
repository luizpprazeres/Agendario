import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const userId = process.argv[2];
if (!userId) {
  console.error("usage: tsx check-entities.mts <USER_ID>");
  process.exit(1);
}

const inbox = await sql`
  SELECT id, status, raw_content, resolved_entity_table, resolved_entity_id,
         parse_error, created_at
  FROM public.inbox_items
  WHERE user_id = ${userId}
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log("\n=== Últimos inbox_items ===");
for (const it of inbox) {
  console.log(
    `[${it.status}] "${it.raw_content?.slice(0, 60)}" → ${it.resolved_entity_table ?? "—"}${it.parse_error ? ` ⚠️ ${it.parse_error}` : ""}`
  );
}

const tx = await sql`
  SELECT id, type, amount_cents, description, occurred_on, category_id
  FROM public.transactions
  WHERE user_id = ${userId}
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log("\n=== Transactions ===");
console.table(tx);

const sh = await sql`
  SELECT id, starts_at, ends_at, pay_cents, status, workplace_id
  FROM public.shifts
  WHERE user_id = ${userId}
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log("\n=== Shifts ===");
console.table(sh);

const tk = await sql`
  SELECT id, title, due_at, priority, status
  FROM public.tasks
  WHERE user_id = ${userId}
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log("\n=== Tasks ===");
console.table(tk);

await sql.end();
