-- ============================================================
-- Agendario — RLS Policies para expense_templates
-- ============================================================
-- Aplicar APÓS a migration 0003_silly_layla_miller.sql que cria a tabela.
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================

ALTER TABLE public.expense_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_templates_owner_all" ON public.expense_templates;
CREATE POLICY "expense_templates_owner_all" ON public.expense_templates
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
