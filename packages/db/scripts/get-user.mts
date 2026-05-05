import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: "/Users/luizprazeres/Agendario/.env.local" });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const rows = await sql<{ id: string; email: string }[]>`
  SELECT id, email FROM auth.users WHERE email = 'contato@luizprazeres.com.br'
`;
console.log(JSON.stringify(rows[0] || null));
await sql.end();
