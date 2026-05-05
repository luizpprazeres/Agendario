/**
 * Seed idempotente de categorias para um usuário.
 *
 * Uso:
 *   pnpm --filter @agendario/db seed:categories <USER_ID>
 *
 * Ou programaticamente:
 *   import { seedCategoriesForUser } from "@agendario/db/seed/seed-categories";
 *   await seedCategoriesForUser(db, userId);
 *
 * Idempotência: usa ON CONFLICT (user_id, slug) DO UPDATE para atualizar metadata
 * (ícone, cor, parent) mas preservar o ID existente — assim transações já vinculadas
 * não perdem referência ao re-rodar.
 */
import { sql } from "drizzle-orm";
import { categories } from "../schema/financial";
import type { createDb } from "../client";
import { SEED_CATEGORIES } from "./categories-data";

type Db = ReturnType<typeof createDb>;

export async function seedCategoriesForUser(db: Db, userId: string) {
  const inserted: string[] = [];

  // Não há hierarquia ativa neste seed inicial — todas categorias são root.
  // Quando adicionarmos sub-categorias, fazer 2 passes (parent first, depois children).
  for (const cat of SEED_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        user_id: userId,
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        deductible_carne_leao: cat.deductible_carne_leao ?? false,
        is_system: true,
        sort_order: cat.sort_order.toString(),
      })
      .onConflictDoUpdate({
        target: [categories.user_id, categories.slug],
        set: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          deductible_carne_leao: cat.deductible_carne_leao ?? false,
          sort_order: cat.sort_order.toString(),
          updated_at: sql`now()`,
        },
      });
    inserted.push(cat.slug);
  }

  return {
    total: inserted.length,
    slugs: inserted,
  };
}

// CLI runner — executado quando rodado direto via tsx
async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("❌ Uso: pnpm seed:categories <USER_ID>");
    console.error("   USER_ID = uuid de auth.users (Supabase Dashboard → Auth → Users)");
    process.exit(1);
  }

  // Validar UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    console.error(`❌ USER_ID inválido (não é um UUID): ${userId}`);
    process.exit(1);
  }

  // Carregar .env.local da raiz
  const { config } = await import("dotenv");
  const { resolve } = await import("node:path");
  config({ path: resolve(process.cwd(), "../../.env.local") });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL não configurada em .env.local");
    process.exit(1);
  }

  const { createDb } = await import("../client");
  const db = createDb(databaseUrl);

  console.log(`🌱 Seedando categorias para user_id=${userId}...`);
  const result = await seedCategoriesForUser(db, userId);
  console.log(`✅ ${result.total} categorias inseridas/atualizadas.`);
  process.exit(0);
}

// Executa main() apenas se for entrypoint direto
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed-categories.ts");

if (isMain) {
  main().catch((err) => {
    console.error("❌ Erro ao seedar categorias:", err);
    process.exit(1);
  });
}
