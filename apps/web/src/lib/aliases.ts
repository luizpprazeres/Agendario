/**
 * Aliases de descrição — aprende renomeações implicitamente.
 *
 * Quando user edita "AMZN MKTP BR" pra "Amazon" + categoria, salvamos via
 * upsertAlias. No próximo batch, applyAliases substitui automaticamente.
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { descriptionAliases } from "@agendario/db";
import { getDb } from "@/lib/db";

export type AliasRow = {
  pattern: string;
  match_type: string;
  canonical_name: string;
  suggested_category_id: string | null;
};

export type AliasMatch = {
  canonical_name: string;
  suggested_category_id: string | null;
};

export async function loadUserAliases(userId: string): Promise<AliasRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      pattern: descriptionAliases.pattern,
      match_type: descriptionAliases.match_type,
      canonical_name: descriptionAliases.canonical_name,
      suggested_category_id: descriptionAliases.suggested_category_id,
    })
    .from(descriptionAliases)
    .where(eq(descriptionAliases.user_id, userId));
  return rows;
}

export function applyAliases(
  rawDescription: string,
  aliases: AliasRow[]
): AliasMatch | null {
  const normalized = rawDescription.toLowerCase().trim();
  for (const a of aliases) {
    const p = a.pattern.toLowerCase();
    let matches = false;
    if (a.match_type === "exact") matches = normalized === p;
    else if (a.match_type === "starts_with") matches = normalized.startsWith(p);
    else matches = normalized.includes(p);
    if (matches) {
      return {
        canonical_name: a.canonical_name,
        suggested_category_id: a.suggested_category_id,
      };
    }
  }
  return null;
}

/**
 * Cria ou atualiza um alias. Usa uniqueIndex (user_id, pattern).
 * Sempre `match_type='contains'` (default razoável; futuras melhorias podem
 * inferir o melhor tipo).
 */
export async function upsertAlias(args: {
  userId: string;
  pattern: string;
  canonicalName: string;
  suggestedCategoryId: string | null;
}) {
  const db = getDb();
  await db
    .insert(descriptionAliases)
    .values({
      user_id: args.userId,
      pattern: args.pattern,
      match_type: "contains",
      canonical_name: args.canonicalName,
      suggested_category_id: args.suggestedCategoryId,
      usage_count: 1,
      last_used_at: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [descriptionAliases.user_id, descriptionAliases.pattern],
      set: {
        canonical_name: args.canonicalName,
        suggested_category_id: args.suggestedCategoryId,
        usage_count: sql`${descriptionAliases.usage_count} + 1`,
        last_used_at: sql`now()`,
      },
    });
}
