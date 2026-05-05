CREATE TABLE IF NOT EXISTS "credit_card_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"vendor" text,
	"category_id" uuid,
	"total_cents" numeric(14, 0) NOT NULL,
	"installment_count" integer NOT NULL,
	"installment_cents" numeric(14, 0) NOT NULL,
	"first_charge_on" date NOT NULL,
	"paid_installments" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "cc_closing_day" smallint;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "cc_due_day" smallint;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "cc_limit_cents" numeric(14, 0);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cc_installments_user_account_idx" ON "credit_card_installments" USING btree ("user_id","account_id");