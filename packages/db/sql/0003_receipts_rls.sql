-- ============================================================
-- Agendario — RLS Policies para Receipt OCR
-- ============================================================
-- Aplicar APÓS a migration 0002_noisy_timeslip.sql que cria as tabelas.
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE.
--
-- Inclui:
--   1. RLS owner-all em inbox_batches, inbox_batch_items, description_aliases
--   2. Storage policies do bucket 'receipts' — convenção de path:
--      {user_id}/{batch_id}/{filename}
--      O primeiro segmento de path tem que ser o auth.uid() do dono.
-- ============================================================

-- ---------- Tabela: inbox_batches ----------
ALTER TABLE public.inbox_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_batches_owner_all" ON public.inbox_batches;
CREATE POLICY "inbox_batches_owner_all" ON public.inbox_batches
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------- Tabela: inbox_batch_items ----------
ALTER TABLE public.inbox_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_batch_items_owner_all" ON public.inbox_batch_items;
CREATE POLICY "inbox_batch_items_owner_all" ON public.inbox_batch_items
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------- Tabela: description_aliases ----------
ALTER TABLE public.description_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "description_aliases_owner_all" ON public.description_aliases;
CREATE POLICY "description_aliases_owner_all" ON public.description_aliases
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Storage policies — bucket 'receipts'
-- ============================================================
-- Pré-requisito: bucket 'receipts' criado no Supabase Dashboard
--   - Storage → Create bucket
--   - Name: receipts
--   - Public: NO (private)
--   - File size limit: 25 MB
--   - Allowed MIME types: image/png, image/jpeg, image/webp, application/pdf
--
-- (storage.foldername(name))[1] = primeiro segmento do path = user_id
-- ============================================================

DROP POLICY IF EXISTS "users_read_own_receipts" ON storage.objects;
CREATE POLICY "users_read_own_receipts" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "users_insert_own_receipts" ON storage.objects;
CREATE POLICY "users_insert_own_receipts" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "users_delete_own_receipts" ON storage.objects;
CREATE POLICY "users_delete_own_receipts" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
