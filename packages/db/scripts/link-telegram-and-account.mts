import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const userId = process.argv[2];
const chatId = process.argv[3];
if (!userId || !chatId) {
  console.error("usage: tsx link-telegram-and-account.mts <USER_ID> <CHAT_ID>");
  process.exit(1);
}

// 1. Vincular Telegram
const tg = await sql`
  INSERT INTO public.telegram_users (user_id, telegram_chat_id, is_active)
  VALUES (${userId}, ${chatId}, true)
  ON CONFLICT (telegram_chat_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, is_active = true
  RETURNING user_id, telegram_chat_id
`;
console.log("Telegram vinculado:", tg[0]);

// 2. Criar conta financeira inicial (idempotente por nome)
const existing = await sql`
  SELECT id FROM public.financial_accounts
  WHERE user_id = ${userId} AND name = 'Conta principal'
  LIMIT 1
`;
if (existing[0]) {
  console.log("Conta financeira já existe:", existing[0].id);
} else {
  const acc = await sql`
    INSERT INTO public.financial_accounts (
      user_id, name, type, currency, initial_balance_cents, is_archived
    )
    VALUES (${userId}, 'Conta principal', 'checking', 'BRL', 0, false)
    RETURNING id, name, type
  `;
  console.log("Conta financeira criada:", acc[0]);
}

await sql.end();
