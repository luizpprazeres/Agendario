CREATE TABLE IF NOT EXISTS "description_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"match_type" text DEFAULT 'contains' NOT NULL,
	"canonical_name" text NOT NULL,
	"suggested_category_id" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"raw_description" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" numeric(14, 0) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"occurred_on" date NOT NULL,
	"suggested_category_id" uuid,
	"confidence" numeric(5, 4),
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_id" uuid,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_of_transaction_id" uuid,
	"installment_current" integer,
	"installment_total" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_file_url" text,
	"source_file_type" text,
	"source_file_size_bytes" integer,
	"source_file_hash" text,
	"detected_origin" text,
	"statement_period_start" date,
	"statement_period_end" date,
	"status" text DEFAULT 'parsing' NOT NULL,
	"raw_extraction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"total_count" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" numeric(14, 0) DEFAULT '0' NOT NULL,
	"target_account_id" uuid,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "description_aliases" ADD CONSTRAINT "description_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "description_aliases" ADD CONSTRAINT "description_aliases_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batch_items" ADD CONSTRAINT "inbox_batch_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batch_items" ADD CONSTRAINT "inbox_batch_items_batch_id_inbox_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inbox_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batch_items" ADD CONSTRAINT "inbox_batch_items_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batch_items" ADD CONSTRAINT "inbox_batch_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batch_items" ADD CONSTRAINT "inbox_batch_items_duplicate_of_transaction_id_transactions_id_fk" FOREIGN KEY ("duplicate_of_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batches" ADD CONSTRAINT "inbox_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_batches" ADD CONSTRAINT "inbox_batches_target_account_id_financial_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "aliases_user_pattern_unique" ON "description_aliases" USING btree ("user_id","pattern");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_items_batch_position_idx" ON "inbox_batch_items" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_items_user_batch_idx" ON "inbox_batch_items" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_user_status_idx" ON "inbox_batches" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_user_hash_idx" ON "inbox_batches" USING btree ("user_id","source_file_hash");