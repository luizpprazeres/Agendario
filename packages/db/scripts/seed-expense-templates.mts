import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const userId = process.argv[2];
if (!userId) {
  console.error("usage: tsx seed-expense-templates.mts <USER_ID>");
  process.exit(1);
}

type Seed = {
  name: string;
  icon: string;
  description_template: string;
  default_amount_cents: string;
  category_slug: string;
  color?: string;
  sort_order?: number;
};

/**
 * Seed inicial de templates 1-clique. Idempotente:
 *   ON CONFLICT (user_id, name) DO NOTHING (índice unique virtual via SELECT antes do INSERT).
 *
 * `default_account_id` é resolvido em runtime: pega a primeira conta checking
 * ativa do user. Se não existir, deixa null e o server action fará fallback.
 */
const seeds: Seed[] = [
  {
    name: "Combustível",
    icon: "⛽",
    description_template: "Combustível",
    default_amount_cents: "30000",
    category_slug: "transporte-combustivel",
    color: "oklch(0.72 0.14 60)",
    sort_order: 10,
  },
  {
    name: "Almoço hospital",
    icon: "🍽️",
    description_template: "Almoço · cantina hospital",
    default_amount_cents: "5000",
    category_slug: "alimentacao-restaurantes",
    color: "oklch(0.74 0.10 35)",
    sort_order: 20,
  },
  {
    name: "Café Café Café",
    icon: "☕",
    description_template: "Café Café Café",
    default_amount_cents: "1200",
    category_slug: "alimentacao-restaurantes",
    color: "oklch(0.55 0.06 50)",
    sort_order: 30,
  },
  {
    name: "Mercado",
    icon: "🛒",
    description_template: "Mercado",
    default_amount_cents: "40000",
    category_slug: "alimentacao-mercado",
    color: "oklch(0.78 0.12 145)",
    sort_order: 40,
  },
  {
    name: "iFood",
    icon: "🛵",
    description_template: "iFood",
    default_amount_cents: "6000",
    category_slug: "alimentacao-delivery",
    color: "oklch(0.68 0.16 25)",
    sort_order: 50,
  },
  {
    name: "Uber",
    icon: "🚗",
    description_template: "Uber",
    default_amount_cents: "3000",
    category_slug: "transporte-app",
    color: "oklch(0.45 0.04 240)",
    sort_order: 60,
  },
];

// Resolve default account: primeira conta NÃO credit_card, NÃO arquivada
const [defaultAccount] = await sql<{ id: string; name: string }[]>`
  SELECT id, name FROM public.financial_accounts
  WHERE user_id = ${userId}
    AND is_archived = false
    AND type != 'credit_card'
  ORDER BY created_at ASC
  LIMIT 1
`;

if (!defaultAccount) {
  console.warn(`⚠️  Nenhuma conta non-credit ativa pro user ${userId} — templates ficarão com default_account_id = null`);
} else {
  console.log(`💳 Conta padrão: ${defaultAccount.name} (${defaultAccount.id})`);
}

console.log(`\nSeeding ${seeds.length} templates pro user ${userId}...\n`);

for (const s of seeds) {
  // Resolve category_id pelo slug
  const [cat] = await sql<{ id: string }[]>`
    SELECT id FROM public.categories
    WHERE user_id = ${userId} AND slug = ${s.category_slug}
    LIMIT 1
  `;
  if (!cat) {
    console.warn(`  ⚠️  ${s.name} — categoria '${s.category_slug}' não encontrada, pulando`);
    continue;
  }

  // Idempotência: skip se já existe pelo nome
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM public.expense_templates
    WHERE user_id = ${userId} AND name = ${s.name}
    LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`  · ${s.name} — already exists`);
    continue;
  }

  await sql`
    INSERT INTO public.expense_templates
      (user_id, name, icon, color, description_template, type,
       default_amount_cents, default_account_id, default_category_id, sort_order)
    VALUES
      (${userId}, ${s.name}, ${s.icon}, ${s.color ?? null},
       ${s.description_template}, 'expense',
       ${s.default_amount_cents}, ${defaultAccount?.id ?? null}, ${cat.id},
       ${s.sort_order ?? 0})
  `;
  console.log(`  + ${s.name} (${s.category_slug}) — R$ ${(Number(s.default_amount_cents) / 100).toFixed(2)}`);
}

await sql.end();
console.log("\nDone.");
