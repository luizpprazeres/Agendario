-- ============================================================
-- Agendario — RLS Policy para subscriptions
-- ============================================================
-- Aplicar APÓS a migration 0001_shallow_purifiers.sql que cria a tabela.
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_owner_all" ON public.subscriptions;
CREATE POLICY "subscriptions_owner_all" ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
