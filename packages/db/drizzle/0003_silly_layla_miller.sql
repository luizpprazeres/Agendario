CREATE TABLE IF NOT EXISTS "expense_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"description_template" text NOT NULL,
	"type" "transaction_type" DEFAULT 'expense' NOT NULL,
	"default_amount_cents" numeric(14, 0) NOT NULL,
	"default_account_id" uuid,
	"default_category_id" uuid,
	"default_workplace_id" uuid,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_default_account_id_financial_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_default_workplace_id_workplaces_id_fk" FOREIGN KEY ("default_workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_user_active_idx" ON "expense_templates" USING btree ("user_id","is_archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_user_usage_idx" ON "expense_templates" USING btree ("user_id","usage_count");