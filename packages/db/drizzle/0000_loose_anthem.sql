-- NOTE: schema "auth" e tabela "auth"."users" são gerenciados pelo Supabase.
-- Removido por nós (Drizzle gerou por causa do FK declarado em _shared.ts).
CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'other');--> statement-breakpoint
CREATE TYPE "public"."inbox_channel" AS ENUM('telegram', 'whatsapp', 'web', 'email', 'csv_import', 'ofx_import');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('pending', 'confirmed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('monthly_summary', 'shift_finance_correlation', 'cashflow_projection', 'carne_leao_export', 'anomaly_alert');--> statement-breakpoint
CREATE TYPE "public"."inbox_intent" AS ENUM('task', 'shift', 'transaction', 'note', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."recurrence_freq" AS ENUM('daily', 'weekly', 'monthly', 'yearly', 'custom_rrule');--> statement-breakpoint
CREATE TYPE "public"."rule_action_type" AS ENUM('set_category', 'add_tag', 'set_workplace', 'mark_deductible', 'split_amount');--> statement-breakpoint
CREATE TYPE "public"."rule_condition_type" AS ENUM('description_contains', 'description_regex', 'amount_eq', 'amount_gt', 'amount_lt', 'amount_between', 'account_eq', 'weekday_eq');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'swapped');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'cancelled', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'cleared', 'reconciled', 'void');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
-- auth.users já existe no Supabase — não recriar.
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"display_name" text,
	"avatar_url" text,
	"timezone" text DEFAULT 'America/Recife' NOT NULL,
	"default_currency" text DEFAULT 'BRL' NOT NULL,
	"telegram_chat_id" text,
	"telegram_username" text,
	"specialty" text,
	"crm" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workplaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"address" text,
	"city" text,
	"state" text,
	"color" text,
	"notes" text,
	"default_hourly_rate_cents" numeric(14, 0),
	"default_shift_pay_cents" numeric(14, 0),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurrence_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"freq" "recurrence_freq" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"byweekday" jsonb DEFAULT '[]'::jsonb,
	"bymonthday" jsonb DEFAULT '[]'::jsonb,
	"count" integer,
	"until" date,
	"rrule" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workplace_id" uuid NOT NULL,
	"recurrence_id" uuid,
	"name" text NOT NULL,
	"start_time_local" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"pay_cents" numeric(14, 0),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workplace_id" uuid NOT NULL,
	"template_id" uuid,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "shift_status" DEFAULT 'scheduled' NOT NULL,
	"pay_cents" numeric(14, 0),
	"notes" text,
	"gcal_event_id" text,
	"gcal_calendar_id" text,
	"gcal_etag" text,
	"locked_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workplace_id" uuid,
	"recurrence_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"estimated_minutes" integer,
	"completed_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gcal_event_id" text,
	"gcal_calendar_id" text,
	"gcal_etag" text,
	"locked_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"amount_cents" numeric(14, 0) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"rollover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"type" "transaction_type" NOT NULL,
	"deductible_carne_leao" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description_key" text NOT NULL,
	"category_id" uuid NOT NULL,
	"hit_count" numeric(10, 0) DEFAULT '0' NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" text,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"initial_balance_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"color" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"target_amount_cents" numeric(14, 0) NOT NULL,
	"current_amount_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"type" "rule_action_type" NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"type" "rule_condition_type" NOT NULL,
	"value" text NOT NULL,
	"secondary_value" text,
	"negate" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" numeric(10, 2) DEFAULT '100' NOT NULL,
	"stop_processing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"workplace_id" uuid,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'cleared' NOT NULL,
	"amount_cents" numeric(14, 0) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"occurred_on" date NOT NULL,
	"cleared_on" date,
	"transfer_pair_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_categorized_by" text,
	"auto_confidence" numeric(5, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "inbox_channel" NOT NULL,
	"external_id" text,
	"raw_content" text NOT NULL,
	"intent" "inbox_intent" DEFAULT 'unknown' NOT NULL,
	"confidence" numeric(5, 4),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "inbox_status" DEFAULT 'pending' NOT NULL,
	"resolved_entity_table" text,
	"resolved_entity_id" uuid,
	"parse_error" text,
	"llm_input_tokens" numeric(10, 0),
	"llm_output_tokens" numeric(10, 0),
	"llm_model" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"expiration" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"timezone" text,
	"color" text,
	"primary" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_direction" text DEFAULT 'both' NOT NULL,
	"sync_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text,
	"format" text NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_rows" text,
	"imported_count" text,
	"duplicate_count" text,
	"error_count" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_user_id" text,
	"telegram_username" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_users_telegram_chat_id_unique" UNIQUE("telegram_chat_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"period_start" date,
	"period_end" date,
	"title" text NOT NULL,
	"summary_markdown" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"llm_model" text,
	"cost_cents_estimate" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_pinned" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_recurrence_id_recurrence_rules_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrence_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_id_recurrence_rules_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrence_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_cache" ADD CONSTRAINT "category_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_cache" ADD CONSTRAINT "category_cache_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_actions" ADD CONSTRAINT "rule_actions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_conditions" ADD CONSTRAINT "rule_conditions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_calendar_watches" ADD CONSTRAINT "google_calendar_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_users" ADD CONSTRAINT "telegram_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workplaces_user_idx" ON "workplaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_templates_user_idx" ON "shift_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shifts_user_time_idx" ON "shifts" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shifts_workplace_idx" ON "shifts" USING btree ("workplace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shifts_gcal_event_unique" ON "shifts" USING btree ("user_id","gcal_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_user_slug_unique" ON "categories" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_cache_unique" ON "category_cache" USING btree ("user_id","description_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_accounts_user_idx" ON "financial_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rules_user_active_idx" ON "rules" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_date_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_external_unique" ON "transactions" USING btree ("user_id","account_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_user_status_idx" ON "inbox_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_channel_idx" ON "inbox_items" USING btree ("channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_tokens_user_email_idx" ON "google_calendar_tokens" USING btree ("user_id","google_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_calendars_user_cal_idx" ON "google_calendars" USING btree ("user_id","calendar_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_users_user_idx" ON "telegram_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_user_kind_idx" ON "insights" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_user_period_idx" ON "insights" USING btree ("user_id","period_start");