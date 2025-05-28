-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "reward_programs" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"created_at" numeric,
	"org_id" text,
	"env" text,
	"internal_reward_id" text,
	"max_redemptions" numeric,
	"unlimited_redemptions" boolean DEFAULT false,
	"when" text,
	"product_ids" text[] DEFAULT '{""}',
	"exclude_trial" boolean DEFAULT false,
	"received_by" text DEFAULT 'referrer'
);
--> statement-breakpoint
ALTER TABLE "reward_programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text NOT NULL,
	"org_id" text NOT NULL,
	"env" text,
	"id" text PRIMARY KEY NOT NULL,
	"internal_reward_program_id" text,
	"created_at" numeric,
	"internal_customer_id" text,
	CONSTRAINT "unique_code_constraint" UNIQUE("code","org_id","env")
);
--> statement-breakpoint
ALTER TABLE "referral_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"updated_at" numeric,
	"internal_customer_id" text,
	"internal_reward_program_id" text,
	"triggered" boolean DEFAULT false,
	"applied" boolean DEFAULT false,
	"referral_code_id" text
);
--> statement-breakpoint
ALTER TABLE "reward_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" numeric,
	"updated_at" numeric,
	"customer_price_id" text,
	"period_start" numeric,
	"period_end" numeric,
	"proration_start" numeric,
	"proration_end" numeric,
	"quantity" numeric,
	"amount" numeric,
	"currency" text,
	"added_to_stripe" boolean
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"default_currency" text,
	"stripe_connected" boolean,
	"stripe_config" jsonb,
	"test_pkey" text,
	"live_pkey" text,
	"svix_config" jsonb,
	"created_at" numeric,
	"config" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "organizations_test_pkey_key" UNIQUE("test_pkey"),
	CONSTRAINT "organizations_live_pkey_key" UNIQUE("live_pkey")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rewards" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"promo_codes" jsonb[],
	"env" text,
	"name" text,
	"org_id" text,
	"created_at" numeric,
	"id" text,
	"discount_config" jsonb,
	"free_product_id" text,
	"type" text
);
--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"name" text,
	"org_id" text NOT NULL,
	"created_at" numeric NOT NULL,
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text,
	"env" text,
	"processor" jsonb,
	"email" text,
	"fingerprint" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "cus_id_constraint" UNIQUE("org_id","id","env")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"name" text,
	"prefix" text,
	"org_id" text,
	"user_id" text,
	"env" text,
	"meta" jsonb,
	"hashed_key" text,
	CONSTRAINT "api_keys_hashed_key_key" UNIQUE("hashed_key")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_products" (
	"id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"customer_id" text,
	"internal_product_id" text,
	"created_at" numeric,
	"status" text,
	"processor" jsonb,
	"canceled_at" numeric,
	"ended_at" numeric,
	"starts_at" numeric,
	"options" jsonb[],
	"product_id" text,
	"free_trial_id" text,
	"trial_ends_at" numeric,
	"collection_method" text DEFAULT 'charge_automatically',
	"subscription_ids" text[],
	"scheduled_ids" text[],
	"is_custom" boolean DEFAULT false,
	"quantity" numeric DEFAULT '1',
	"internal_entity_id" text,
	"entity_id" text
);
--> statement-breakpoint
ALTER TABLE "customer_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"customer_product_id" text,
	"price_id" text,
	"options" jsonb,
	"internal_customer_id" text
);
--> statement-breakpoint
ALTER TABLE "customer_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "features" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"id" text NOT NULL,
	"name" text,
	"type" text,
	"created_at" numeric,
	"config" jsonb,
	"env" text DEFAULT 'live',
	"display" jsonb,
	CONSTRAINT "feature_id_constraint" UNIQUE("org_id","id","env")
);
--> statement-breakpoint
ALTER TABLE "features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"expires_at" numeric,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "metadata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entities" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"created_at" numeric NOT NULL,
	"internal_customer_id" text,
	"internal_feature_id" text,
	"feature_id" text,
	"env" text,
	"id" text,
	"name" text,
	"deleted" boolean,
	CONSTRAINT "entity_id_constraint" UNIQUE("org_id","internal_customer_id","env","id")
);
--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entitlements" (
	"created_at" numeric NOT NULL,
	"internal_feature_id" text,
	"org_id" text,
	"internal_product_id" text,
	"allowance_type" text,
	"allowance" numeric,
	"interval" text,
	"id" text PRIMARY KEY NOT NULL,
	"feature_id" text,
	"is_custom" boolean DEFAULT false,
	"carry_from_previous" boolean DEFAULT false,
	"entity_feature_id" text,
	CONSTRAINT "entitlements_id_key" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prices" (
	"created_at" numeric NOT NULL,
	"config" jsonb,
	"org_id" text,
	"internal_product_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT format(''::text),
	"billing_type" text,
	"is_custom" boolean DEFAULT false,
	"entitlement_id" text,
	CONSTRAINT "prices_id_key" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"name" text,
	"org_id" text,
	"env" text,
	"is_add_on" boolean,
	"processor" jsonb,
	"is_default" boolean DEFAULT false,
	"id" text,
	"group" text DEFAULT '',
	"version" numeric DEFAULT '1'
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"timestamp" numeric NOT NULL,
	"env" text NOT NULL,
	"customer_id" text NOT NULL,
	"event_name" text NOT NULL,
	"properties" jsonb,
	"idempotency_key" text,
	"internal_customer_id" text,
	"value" numeric,
	"set_usage" boolean DEFAULT false,
	"entity_id" text,
	CONSTRAINT "unique_event_constraint" UNIQUE("org_id","env","customer_id","event_name","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "migration_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"updated_at" numeric,
	"current_step" text,
	"from_internal_product_id" text,
	"to_internal_product_id" text,
	"step_details" jsonb,
	"org_id" text,
	"env" text
);
--> statement-breakpoint
ALTER TABLE "migration_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "free_trials" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"internal_product_id" text,
	"duration" text DEFAULT 'day',
	"length" numeric,
	"unique_fingerprint" boolean,
	"is_custom" boolean DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "free_trials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_id" text,
	"stripe_schedule_id" text,
	"created_at" numeric,
	"usage_features" text[],
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"org_id" text,
	"env" text,
	"current_period_start" numeric,
	"current_period_end" numeric
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "migration_errors" (
	"internal_customer_Id" text NOT NULL,
	"migration_job_id" text NOT NULL,
	"created_at" numeric,
	"updated_at" numeric,
	"message" text,
	"code" text,
	"data" jsonb,
	CONSTRAINT "migration_errors_pkey" PRIMARY KEY("internal_customer_Id","migration_job_id")
);
--> statement-breakpoint
ALTER TABLE "migration_errors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reward_programs" ADD CONSTRAINT "reward_triggers_internal_reward_id_fkey" FOREIGN KEY ("internal_reward_id") REFERENCES "public"."rewards"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_programs" ADD CONSTRAINT "reward_triggers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_internal_reward_program_id_fkey" FOREIGN KEY ("internal_reward_program_id") REFERENCES "public"."reward_programs"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_internal_reward_program_id_fkey" FOREIGN KEY ("internal_reward_program_id") REFERENCES "public"."reward_programs"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_customer_price_id_fkey" FOREIGN KEY ("customer_price_id") REFERENCES "public"."customer_prices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "coupons_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_free_trial_id_fkey" FOREIGN KEY ("free_trial_id") REFERENCES "public"."free_trials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_customer_product_id_fkey" FOREIGN KEY ("customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_from_internal_product_id_fkey" FOREIGN KEY ("from_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_to_internal_product_id_fkey" FOREIGN KEY ("to_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_trials" ADD CONSTRAINT "free_trials_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_errors_internal_customer_Id_fkey" FOREIGN KEY ("internal_customer_Id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_errors_migration_job_id_fkey" FOREIGN KEY ("migration_job_id") REFERENCES "public"."migration_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_customers_composite" ON "customers" USING btree ("org_id" text_ops,"env" text_ops,"id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_customers_org_id_env_created_at" ON "customers" USING btree ("org_id" text_ops,"env" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_hashed_key" ON "api_keys" USING hash ("hashed_key" text_ops);--> statement-breakpoint
CREATE INDEX "idx_features_composite" ON "features" USING btree ("org_id" text_ops,"env" text_ops);
*/