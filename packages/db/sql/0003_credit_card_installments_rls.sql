-- ============================================================
-- Agendario — RLS Policy para credit_card_installments
-- ============================================================
-- Aplicar APÓS a migration 0002_glossy_whiplash.sql que cria a tabela.
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE.
-- financial_accounts já tem RLS — não precisa repetir aqui.
-- ============================================================

ALTER TABLE public.credit_card_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_installments_owner_all" ON public.credit_card_installments;
CREATE POLICY "cc_installments_owner_all" ON public.credit_card_installments
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
