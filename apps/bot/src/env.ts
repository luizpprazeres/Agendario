import { config } from "dotenv";
import { resolve } from "node:path";

// Carrega .env.local da raiz do monorepo
config({ path: resolve(import.meta.dirname, "../../../.env.local") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida em .env.local`);
  return v;
}

export const env = {
  TELEGRAM_BOT_TOKEN: required("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  WEB_INTERNAL_WEBHOOK_URL:
    process.env.WEB_INTERNAL_WEBHOOK_URL ??
    "http://localhost:3000/api/webhooks/telegram",
};
