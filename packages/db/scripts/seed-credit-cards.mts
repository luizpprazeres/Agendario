import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const userId = process.argv[2];
if (!userId) {
  console.error("usage: tsx seed-credit-cards.mts <USER_ID>");
  process.exit(1);
}

type Installment = {
  description: string;
  vendor: string;
  total_cents: string;
  installment_count: number;
  installment_cents: string;
  first_charge_on: string;
  paid_installments: number;
};

const card = {
  name: "Nubank Roxinho",
  type: "credit_card" as const,
  institution: "Nubank",
  cc_closing_day: 28,
  cc_due_day: 8,
  cc_limit_cents: "800000", // R$ 8.000
  color: "oklch(0.5 0.18 290)",
};

const installments: Installment[] = [
  {
    description: "Macbook Pro M4",
    vendor: "apple",
    total_cents: "1069200", // R$ 10.692
    installment_count: 12,
    installment_cents: "89100", // R$ 891
    first_charge_on: "2026-02-08",
    paid_installments: 3,
  },
  {
    description: "Estetoscópio Littmann",
    vendor: "littmann",
    total_cents: "144000", // R$ 1.440
    installment_count: 3,
    installment_cents: "48000", // R$ 480
    first_charge_on: "2026-04-08",
    paid_installments: 1,
  },
  {
    description: "Curso UTI Avançada",
    vendor: "instituto",
    total_cents: "192000", // R$ 1.920
    installment_count: 6,
    installment_cents: "32000", // R$ 320
    first_charge_on: "2026-03-08",
    paid_installments: 2,
  },
];

console.log(`Seeding credit card + ${installments.length} installments for user ${userId}...`);

// 1. Upsert do cartão (UPDATE se já existir conta com mesmo nome+user, senão INSERT)
const existing = await sql<{ id: string }[]>`
  SELECT id FROM public.financial_accounts
  WHERE user_id = ${userId} AND name = ${card.name}
  LIMIT 1
`;

let accountId: string;
if (existing.length > 0) {
  accountId = existing[0].id;
  await sql`
    UPDATE public.financial_accounts SET
      type = ${card.type},
      institution = ${card.institution},
      cc_closing_day = ${card.cc_closing_day},
      cc_due_day = ${card.cc_due_day},
      cc_limit_cents = ${card.cc_limit_cents},
      color = ${card.color},
      updated_at = now()
    WHERE id = ${accountId}
  `;
  console.log(`  · ${card.name} (${accountId}) — updated`);
} else {
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO public.financial_accounts
      (user_id, name, type, institution, cc_closing_day, cc_due_day, cc_limit_cents, color)
    VALUES
      (${userId}, ${card.name}, ${card.type}, ${card.institution},
       ${card.cc_closing_day}, ${card.cc_due_day}, ${card.cc_limit_cents}, ${card.color})
    RETURNING id
  `;
  accountId = inserted[0].id;
  console.log(`  + ${card.name} (${accountId}) — inserted`);
}

// 2. Parcelamentos — checar antes de inserir (sem uniqueIndex)
for (const i of installments) {
  const existsRows = await sql<{ id: string }[]>`
    SELECT id FROM public.credit_card_installments
    WHERE user_id = ${userId}
      AND account_id = ${accountId}
      AND description = ${i.description}
    LIMIT 1
  `;
  if (existsRows.length > 0) {
    console.log(`  · ${i.description} — already exists`);
    continue;
  }
  await sql`
    INSERT INTO public.credit_card_installments
      (user_id, account_id, description, vendor, total_cents,
       installment_count, installment_cents, first_charge_on, paid_installments)
    VALUES
      (${userId}, ${accountId}, ${i.description}, ${i.vendor}, ${i.total_cents},
       ${i.installment_count}, ${i.installment_cents}, ${i.first_charge_on}, ${i.paid_installments})
  `;
  console.log(`  + ${i.description} (${i.paid_installments}/${i.installment_count})`);
}

await sql.end();
console.log("Done.");
