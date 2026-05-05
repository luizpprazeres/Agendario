import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const userId = process.argv[2];
if (!userId) {
  console.error("usage: tsx post-seed-status.mts <USER_ID>");
  process.exit(1);
}

const profile = await sql`SELECT id, full_name, timezone, default_currency FROM public.profiles WHERE id = ${userId}`;
const cats = await sql`SELECT COUNT(*)::int AS n FROM public.categories WHERE user_id = ${userId}`;
const accounts = await sql`SELECT COUNT(*)::int AS n FROM public.financial_accounts WHERE user_id = ${userId}`;
const tg = await sql`SELECT telegram_chat_id FROM public.telegram_users WHERE user_id = ${userId}`;

console.log("Profile:", profile[0] ?? "(missing — trigger não rodou?)");
console.log(`Categorias: ${cats[0]?.n}`);
console.log(`Contas financeiras: ${accounts[0]?.n}`);
console.log(`Telegram vinculado: ${tg[0] ? `chat_id=${tg[0].telegram_chat_id}` : "não"}`);

await sql.end();
