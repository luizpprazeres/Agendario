import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const userId = process.argv[2];
if (!userId) {
  console.error("usage: tsx seed-subscriptions.mts <USER_ID>");
  process.exit(1);
}

type Seed = {
  name: string;
  vendor: string;
  amount_cents: string;
  billing_cycle: "monthly" | "yearly";
  next_charge_on: string;
  color?: string;
};

const seeds: Seed[] = [
  {
    name: "Spotify Family",
    vendor: "spotify",
    amount_cents: "3490",
    billing_cycle: "monthly",
    next_charge_on: "2026-05-12",
    color: "oklch(0.85 0.16 155)",
  },
  {
    name: "Netflix Premium",
    vendor: "netflix",
    amount_cents: "5590",
    billing_cycle: "monthly",
    next_charge_on: "2026-05-18",
    color: "oklch(0.74 0.16 25)",
  },
  {
    name: "iCloud 200GB",
    vendor: "icloud",
    amount_cents: "1290",
    billing_cycle: "monthly",
    next_charge_on: "2026-05-22",
    color: "oklch(0.72 0.10 240)",
  },
  {
    name: "Notion AI",
    vendor: "notion",
    amount_cents: "5000",
    billing_cycle: "monthly",
    next_charge_on: "2026-05-28",
    color: "oklch(0.78 0.04 80)",
  },
  {
    name: "GitHub Copilot",
    vendor: "github_copilot",
    amount_cents: "5000",
    billing_cycle: "monthly",
    next_charge_on: "2026-06-03",
    color: "oklch(0.62 0.06 280)",
  },
];

console.log(`Seeding ${seeds.length} subscriptions for user ${userId}...`);

for (const s of seeds) {
  const result = await sql`
    INSERT INTO public.subscriptions
      (user_id, name, vendor, amount_cents, billing_cycle, next_charge_on, status, color)
    VALUES
      (${userId}, ${s.name}, ${s.vendor}, ${s.amount_cents}, ${s.billing_cycle},
       ${s.next_charge_on}, 'active', ${s.color ?? null})
    ON CONFLICT (user_id, vendor) DO NOTHING
    RETURNING id
  `;
  const inserted = result.length > 0;
  console.log(`  ${inserted ? "+" : "·"} ${s.name} (${s.vendor})${inserted ? "" : " — already exists"}`);
}

await sql.end();
console.log("Done.");
