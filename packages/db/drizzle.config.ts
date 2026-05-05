import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { resolve } from "node:path";

// Carrega .env.local da raiz do monorepo
config({ path: resolve(__dirname, "../../.env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL não definida. Rode `supabase start` e cole a DB URL no .env.local."
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
