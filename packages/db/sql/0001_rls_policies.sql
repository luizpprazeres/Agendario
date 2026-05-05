-- ============================================================
-- Agendario — RLS Policies (Artefato #4)
-- ============================================================
-- Estratégia: isolamento por user_id em TODAS as tabelas user-scoped.
-- Política única por tabela: USING + WITH CHECK = (user_id = auth.uid()).
-- Para profiles: id = auth.uid() (1:1 com auth.users).
-- Para tabelas filhas (rule_conditions, rule_actions): EXISTS na tabela pai.
--
-- Como aplicar:
--   1. Abra Supabase Dashboard → SQL Editor → New query
--   2. Cole TODO este arquivo
--   3. Run
--
-- Idempotente: usa DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================

-- ============================================================
-- 1. Habilitar RLS em todas as tabelas
-- ============================================================
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workplaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_conditions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_actions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_cache          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendars        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights                ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. profiles — PK = auth.users.id (1:1)
-- ============================================================
DROP POLICY IF EXISTS "profiles_self_access" ON public.profiles;
CREATE POLICY "profiles_self_access" ON public.profiles
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- 3. Tabelas user-scoped padrão (user_id = auth.uid())
-- ============================================================

-- workplaces
DROP POLICY IF EXISTS "workplaces_owner_all" ON public.workplaces;
CREATE POLICY "workplaces_owner_all" ON public.workplaces
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- recurrence_rules
DROP POLICY IF EXISTS "recurrence_rules_owner_all" ON public.recurrence_rules;
CREATE POLICY "recurrence_rules_owner_all" ON public.recurrence_rules
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- shift_templates
DROP POLICY IF EXISTS "shift_templates_owner_all" ON public.shift_templates;
CREATE POLICY "shift_templates_owner_all" ON public.shift_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- shifts
DROP POLICY IF EXISTS "shifts_owner_all" ON public.shifts;
CREATE POLICY "shifts_owner_all" ON public.shifts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tasks
DROP POLICY IF EXISTS "tasks_owner_all" ON public.tasks;
CREATE POLICY "tasks_owner_all" ON public.tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- financial_accounts
DROP POLICY IF EXISTS "fin_accounts_owner_all" ON public.financial_accounts;
CREATE POLICY "fin_accounts_owner_all" ON public.financial_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- categories
DROP POLICY IF EXISTS "categories_owner_all" ON public.categories;
CREATE POLICY "categories_owner_all" ON public.categories
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- transactions
DROP POLICY IF EXISTS "transactions_owner_all" ON public.transactions;
CREATE POLICY "transactions_owner_all" ON public.transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- budgets
DROP POLICY IF EXISTS "budgets_owner_all" ON public.budgets;
CREATE POLICY "budgets_owner_all" ON public.budgets
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- financial_goals
DROP POLICY IF EXISTS "financial_goals_owner_all" ON public.financial_goals;
CREATE POLICY "financial_goals_owner_all" ON public.financial_goals
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- rules
DROP POLICY IF EXISTS "rules_owner_all" ON public.rules;
CREATE POLICY "rules_owner_all" ON public.rules
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- category_cache
DROP POLICY IF EXISTS "category_cache_owner_all" ON public.category_cache;
CREATE POLICY "category_cache_owner_all" ON public.category_cache
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- inbox_items
DROP POLICY IF EXISTS "inbox_items_owner_all" ON public.inbox_items;
CREATE POLICY "inbox_items_owner_all" ON public.inbox_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- google_calendar_tokens
DROP POLICY IF EXISTS "gcal_tokens_owner_all" ON public.google_calendar_tokens;
CREATE POLICY "gcal_tokens_owner_all" ON public.google_calendar_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- google_calendars
DROP POLICY IF EXISTS "gcal_calendars_owner_all" ON public.google_calendars;
CREATE POLICY "gcal_calendars_owner_all" ON public.google_calendars
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- google_calendar_watches
DROP POLICY IF EXISTS "gcal_watches_owner_all" ON public.google_calendar_watches;
CREATE POLICY "gcal_watches_owner_all" ON public.google_calendar_watches
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- telegram_users
DROP POLICY IF EXISTS "telegram_users_owner_all" ON public.telegram_users;
CREATE POLICY "telegram_users_owner_all" ON public.telegram_users
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- imports
DROP POLICY IF EXISTS "imports_owner_all" ON public.imports;
CREATE POLICY "imports_owner_all" ON public.imports
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- insights
DROP POLICY IF EXISTS "insights_owner_all" ON public.insights;
CREATE POLICY "insights_owner_all" ON public.insights
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. Tabelas filhas — herdam ownership da pai
-- ============================================================

-- rule_conditions: ownership via rules.user_id
DROP POLICY IF EXISTS "rule_conditions_owner_all" ON public.rule_conditions;
CREATE POLICY "rule_conditions_owner_all" ON public.rule_conditions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rules r
      WHERE r.id = rule_conditions.rule_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rules r
      WHERE r.id = rule_conditions.rule_id AND r.user_id = auth.uid()
    )
  );

-- rule_actions: ownership via rules.user_id
DROP POLICY IF EXISTS "rule_actions_owner_all" ON public.rule_actions;
CREATE POLICY "rule_actions_owner_all" ON public.rule_actions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rules r
      WHERE r.id = rule_actions.rule_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rules r
      WHERE r.id = rule_actions.rule_id AND r.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. Trigger: auto-criar profile ao registrar auth.user
-- ============================================================
-- Quando um usuário se registra (auth.users INSERT), criar row em profiles
-- com timezone e currency padrão.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, display_name, timezone, default_currency)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'America/Recife',
    'BRL'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 6. Trigger: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicar em todas as tabelas que têm updated_at
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','workplaces','recurrence_rules','shift_templates','shifts','tasks',
    'financial_accounts','categories','transactions','budgets','financial_goals',
    'rules','category_cache','inbox_items','google_calendar_tokens',
    'google_calendars','google_calendar_watches','telegram_users','imports','insights'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END;
$$;

-- ============================================================
-- 7. Permissões — service_role bypassa RLS automaticamente.
-- Nada a fazer aqui. authenticated já tem GRANT padrão do Supabase.
-- ============================================================

-- ============================================================
-- ✅ RLS aplicado.
-- Para validar:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--   SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
-- ============================================================
