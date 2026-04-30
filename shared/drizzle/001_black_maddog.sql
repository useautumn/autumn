CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "actions" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"org_id" text NOT NULL,
	"org_slug" text NOT NULL,
	"env" text NOT NULL,
	"customer_id" text,
	"internal_customer_id" text,
	"entity_id" text,
	"internal_entity_id" text,
	"type" text NOT NULL,
	"auth_type" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"properties" jsonb
);
--> statement-breakpoint
ALTER TABLE "actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"name" text,
	"prefix" text,
	"org_id" text,
	"user_id" text,
	"env" text,
	"hashed_key" text,
	"meta" jsonb,
	CONSTRAINT "api_keys_hashed_key_key" UNIQUE("hashed_key")
);
--> statement-breakpoint
CREATE TABLE "auto_topup_limit_states" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"purchase_window_ends_at" numeric NOT NULL,
	"purchase_count" numeric DEFAULT 0 NOT NULL,
	"attempt_window_ends_at" numeric NOT NULL,
	"attempt_count" numeric DEFAULT 0 NOT NULL,
	"failed_attempt_window_ends_at" numeric NOT NULL,
	"failed_attempt_count" numeric DEFAULT 0 NOT NULL,
	"last_attempt_at" numeric,
	"last_failed_attempt_at" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_results" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"created_at" numeric,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"action" text NOT NULL,
	"params" jsonb NOT NULL,
	"params_version" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"response" jsonb,
	"stripe_invoice_id" text,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"expires_at" numeric NOT NULL,
	"completed_at" numeric
);
--> statement-breakpoint
CREATE TABLE "customer_entitlements" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"customer_product_id" text,
	"entitlement_id" text NOT NULL,
	"internal_customer_id" text COLLATE "C" NOT NULL,
	"internal_entity_id" text,
	"internal_feature_id" text NOT NULL,
	"unlimited" boolean DEFAULT false,
	"balance" numeric DEFAULT 0 NOT NULL,
	"created_at" numeric NOT NULL,
	"next_reset_at" numeric,
	"usage_allowed" boolean DEFAULT false,
	"adjustment" numeric,
	"additional_balance" numeric DEFAULT 0 NOT NULL,
	"entities" jsonb,
	"expires_at" numeric,
	"cache_version" integer DEFAULT 0,
	"customer_id" text,
	"feature_id" text,
	"external_id" text
);
--> statement-breakpoint
CREATE TABLE "customer_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"price_id" text,
	"options" jsonb,
	"internal_customer_id" text,
	"customer_product_id" text
);
--> statement-breakpoint
CREATE TABLE "customer_products" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_product_id" text NOT NULL,
	"internal_entity_id" text,
	"created_at" numeric,
	"status" text,
	"processor" jsonb,
	"canceled" boolean DEFAULT false,
	"canceled_at" numeric,
	"ended_at" numeric,
	"starts_at" numeric,
	"options" jsonb[],
	"product_id" text,
	"free_trial_id" text,
	"trial_ends_at" numeric,
	"billing_cycle_anchor_resets_at" numeric,
	"collection_method" text DEFAULT 'charge_automatically',
	"subscription_ids" text[],
	"scheduled_ids" text[],
	"quantity" numeric DEFAULT 1,
	"is_custom" boolean DEFAULT false NOT NULL,
	"customer_id" text,
	"entity_id" text,
	"billing_version" text,
	"api_version" numeric,
	"api_semver" text,
	"external_id" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"internal_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" numeric NOT NULL,
	"name" text,
	"id" text,
	"email" text,
	"fingerprint" text DEFAULT null,
	"metadata" jsonb,
	"env" text NOT NULL,
	"processor" jsonb,
	"processors" jsonb DEFAULT '{}'::jsonb,
	"send_email_receipts" boolean DEFAULT false,
	"auto_topups" jsonb,
	"spend_limits" jsonb,
	"usage_alerts" jsonb,
	"overage_allowed" jsonb,
	"config" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "cus_id_constraint" UNIQUE("org_id","id","env")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text,
	"org_id" text,
	"created_at" numeric NOT NULL,
	"internal_id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"env" text,
	"name" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"internal_feature_id" text,
	"spend_limits" jsonb,
	"usage_alerts" jsonb,
	"overage_allowed" jsonb,
	"feature_id" text,
	CONSTRAINT "entity_id_constraint" UNIQUE("org_id","env","internal_customer_id","id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"internal_feature_id" text NOT NULL,
	"internal_product_id" text,
	"is_custom" boolean DEFAULT false,
	"allowance_type" text,
	"allowance" numeric,
	"interval" text,
	"interval_count" numeric DEFAULT 1,
	"carry_from_previous" boolean DEFAULT false,
	"entity_feature_id" text DEFAULT null,
	"org_id" text,
	"feature_id" text,
	"usage_limit" numeric,
	"rollover" jsonb,
	CONSTRAINT "entitlements_id_key" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"org_slug" text NOT NULL,
	"internal_customer_id" text,
	"env" text NOT NULL,
	"created_at" bigint,
	"timestamp" timestamp with time zone,
	"event_name" text NOT NULL,
	"idempotency_key" text DEFAULT null,
	"value" numeric,
	"set_usage" boolean DEFAULT false,
	"entity_id" text,
	"internal_entity_id" text,
	"customer_id" text NOT NULL,
	"properties" jsonb,
	CONSTRAINT "unique_event_constraint" UNIQUE("org_id","env","customer_id","event_name","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "features" (
	"internal_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" numeric,
	"env" text,
	"id" text NOT NULL,
	"name" text,
	"type" text NOT NULL,
	"config" jsonb,
	"display" jsonb DEFAULT null,
	"archived" boolean DEFAULT false NOT NULL,
	"event_names" text[] DEFAULT '{}',
	CONSTRAINT "feature_id_constraint" UNIQUE("org_id","id","env")
);
--> statement-breakpoint
CREATE TABLE "free_trials" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric NOT NULL,
	"internal_product_id" text,
	"duration" text DEFAULT 'day',
	"length" numeric,
	"unique_fingerprint" boolean,
	"is_custom" boolean DEFAULT false,
	"card_required" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"invoice_id" text,
	"stripe_id" text,
	"stripe_invoice_id" text,
	"stripe_invoice_item_id" text,
	"stripe_subscription_item_id" text,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"stripe_discountable" boolean DEFAULT true NOT NULL,
	"amount" numeric NOT NULL,
	"amount_after_discounts" numeric NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_quantity" numeric,
	"total_quantity" numeric,
	"paid_quantity" numeric,
	"description" text NOT NULL,
	"description_source" text,
	"direction" text NOT NULL,
	"billing_timing" text,
	"prorated" boolean DEFAULT false NOT NULL,
	"price_id" text,
	"customer_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_price_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_entitlement_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_product_id" text,
	"product_id" text,
	"internal_feature_id" text,
	"feature_id" text,
	"effective_period_start" numeric,
	"effective_period_end" numeric,
	"discounts" jsonb[] DEFAULT '{}',
	CONSTRAINT "invoice_line_items_stripe_id_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"product_ids" text[] DEFAULT '{}',
	"internal_product_ids" text[] DEFAULT '{}',
	"internal_customer_id" text NOT NULL,
	"internal_entity_id" text,
	"stripe_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hosted_invoice_url" text,
	"total" numeric DEFAULT 0 NOT NULL,
	"refunded_amount" numeric DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"discounts" jsonb[] DEFAULT '{}',
	"items" jsonb[] DEFAULT '{}',
	CONSTRAINT "invoices_stripe_id_key" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jwks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"expires_at" numeric,
	"data" jsonb,
	"type" text,
	"stripe_invoice_id" text,
	"stripe_checkout_session_id" text
);
--> statement-breakpoint
CREATE TABLE "migration_errors" (
	"internal_customer_id" text NOT NULL,
	"migration_job_id" text NOT NULL,
	"created_at" numeric,
	"updated_at" numeric,
	"data" jsonb,
	"message" text,
	"code" text,
	CONSTRAINT "migration_errors_pkey" PRIMARY KEY("internal_customer_id","migration_job_id")
);
--> statement-breakpoint
CREATE TABLE "migration_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"created_at" numeric NOT NULL,
	"updated_at" numeric,
	"current_step" text,
	"from_internal_product_id" text,
	"to_internal_product_id" text,
	"step_details" jsonb
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"scopes" text[],
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "oauth_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_consent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"revoked" timestamp with time zone,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo" text,
	"createdAt" timestamp with time zone NOT NULL,
	"metadata" text,
	"default_currency" text DEFAULT 'usd',
	"stripe_connected" boolean DEFAULT false,
	"stripe_config" jsonb,
	"test_stripe_connect" jsonb DEFAULT '{}'::jsonb,
	"live_stripe_connect" jsonb DEFAULT '{}'::jsonb,
	"processor_configs" jsonb,
	"test_pkey" text,
	"live_pkey" text,
	"svix_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"onboarded" boolean DEFAULT false,
	"deployed" boolean DEFAULT false,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_test_pkey_key" UNIQUE("test_pkey"),
	CONSTRAINT "organizations_live_pkey_key" UNIQUE("live_pkey")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"internal_product_id" text NOT NULL,
	"config" jsonb,
	"created_at" numeric NOT NULL,
	"billing_type" text,
	"tier_behavior" text DEFAULT null,
	"is_custom" boolean DEFAULT false,
	"entitlement_id" text DEFAULT null,
	"proration_config" jsonb DEFAULT null,
	CONSTRAINT "prices_id_key" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"name" text,
	"description" text,
	"org_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"env" text NOT NULL,
	"is_add_on" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"group" text DEFAULT '',
	"version" numeric DEFAULT 1 NOT NULL,
	"processor" jsonb DEFAULT null,
	"base_variant_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_product" UNIQUE("org_id","id","env","version")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text COLLATE "C",
	"internal_reward_program_id" text,
	"id" text NOT NULL,
	"created_at" numeric,
	CONSTRAINT "referral_codes_pkey" PRIMARY KEY("code","org_id","env"),
	CONSTRAINT "referral_codes_id_key" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "replaceables" (
	"id" text PRIMARY KEY NOT NULL,
	"cus_ent_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"from_entity_id" text,
	"delete_next_cycle" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "replaceables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "revenuecat_mappings" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"autumn_product_id" text NOT NULL,
	"revenuecat_product_ids" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "revenuecat_mappings_pkey" PRIMARY KEY("org_id","env","autumn_product_id")
);
--> statement-breakpoint
CREATE TABLE "reward_programs" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text,
	"created_at" numeric,
	"internal_reward_id" text,
	"max_redemptions" numeric,
	"unlimited_redemptions" boolean DEFAULT false,
	"org_id" text,
	"env" text,
	"when" text DEFAULT 'immediately',
	"product_ids" text[] DEFAULT '{""}',
	"exclude_trial" boolean DEFAULT false,
	"received_by" text
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" numeric,
	"updated_at" numeric,
	"internal_customer_id" text COLLATE "C",
	"triggered" boolean,
	"internal_reward_program_id" text,
	"applied" boolean DEFAULT false,
	"redeemer_applied" boolean DEFAULT false,
	"referral_code_id" text
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text,
	"org_id" text,
	"env" text,
	"created_at" numeric,
	"name" text,
	"discount_config" jsonb,
	"free_product_config" jsonb,
	"free_product_id" text,
	"promo_codes" jsonb[],
	"type" text
);
--> statement-breakpoint
CREATE TABLE "rollovers" (
	"id" text PRIMARY KEY NOT NULL,
	"cus_ent_id" text NOT NULL,
	"balance" numeric NOT NULL,
	"expires_at" numeric,
	"usage" numeric DEFAULT 0 NOT NULL,
	"entities" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rollovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "phases" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"starts_at" numeric NOT NULL,
	"customer_product_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" numeric NOT NULL,
	CONSTRAINT "phases_schedule_id_starts_at_key" UNIQUE("schedule_id","starts_at")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"internal_entity_id" text,
	"entity_id" text,
	"created_at" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	"city" text,
	"country" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"stripe_id" text,
	"stripe_schedule_id" text,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"usage_features" text[] DEFAULT '{}',
	"env" text,
	"current_period_start" numeric,
	"current_period_end" numeric,
	CONSTRAINT "subscriptions_stripe_id_key" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_by" text,
	"last_active_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vercel_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"installation_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_topup_limit_states" ADD CONSTRAINT "auto_topup_limits_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_topup_limit_states" ADD CONSTRAINT "auto_topup_limits_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD CONSTRAINT "entitlements_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD CONSTRAINT "customer_entitlements_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD CONSTRAINT "customer_entitlements_customer_product_id_fkey" FOREIGN KEY ("customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD CONSTRAINT "customer_entitlements_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_customer_product_id_fkey" FOREIGN KEY ("customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_free_trial_id_fkey" FOREIGN KEY ("free_trial_id") REFERENCES "public"."free_trials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_trials" ADD CONSTRAINT "free_trials_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_customers_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_customers_migration_job_id_fkey" FOREIGN KEY ("migration_job_id") REFERENCES "public"."migration_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_from_internal_product_id_fkey" FOREIGN KEY ("from_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_to_internal_product_id_fkey" FOREIGN KEY ("to_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_internal_product_id_fkey" FOREIGN KEY ("internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_internal_reward_program_id_fkey" FOREIGN KEY ("internal_reward_program_id") REFERENCES "public"."reward_programs"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replaceables" ADD CONSTRAINT "replaceables_cus_ent_id_fkey" FOREIGN KEY ("cus_ent_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenuecat_mappings" ADD CONSTRAINT "revenuecat_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_programs" ADD CONSTRAINT "reward_triggers_internal_reward_id_fkey" FOREIGN KEY ("internal_reward_id") REFERENCES "public"."rewards"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_programs" ADD CONSTRAINT "reward_triggers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_internal_reward_program_id_fkey" FOREIGN KEY ("internal_reward_program_id") REFERENCES "public"."reward_programs"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "coupons_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollovers" ADD CONSTRAINT "rollover_cus_ent_id_fkey" FOREIGN KEY ("cus_ent_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vercel_resources" ADD CONSTRAINT "vercel_resources_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_actions_on_internal_entity_id" ON "actions" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "auto_topup_limits_org_env_internal_customer_feature_unique" ON "auto_topup_limit_states" USING btree ("org_id","env","internal_customer_id","feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_checkouts_stripe_invoice_id" ON "checkouts" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_product_id" ON "customer_entitlements" USING btree ("customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_internal_customer_id" ON "customer_entitlements" USING hash ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_internal_customer_id_btree" ON "customer_entitlements" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_entitlement_id" ON "customer_entitlements" USING btree ("entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_internal_entity_id" ON "customer_entitlements" USING hash ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_on_next_reset_at" ON "customer_entitlements" USING btree ("next_reset_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_loose_customer_expires" ON "customer_entitlements" USING btree ("internal_customer_id","expires_at") WHERE "customer_entitlements"."customer_product_id" IS NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_prices_product_id" ON "customer_prices" USING btree ("customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_prices_price_id" ON "customer_prices" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_customer_status" ON "customer_products" USING btree ("internal_customer_id","status");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_on_internal_entity_id" ON "customer_products" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_on_internal_product_id" ON "customer_products" USING btree ("internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_subscription_ids" ON "customer_products" USING gin ("subscription_ids");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "customers_email_null_id_unique" ON "customers" USING btree ("org_id","env",lower("email")) WHERE "customers"."id" IS NULL AND "customers"."email" IS NOT NULL AND "customers"."email" != '';--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_org_env_fingerprint" ON "customers" USING btree ("org_id","env","fingerprint") WHERE "customers"."fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_processor_id" ON "customers" USING btree (("processor" ->> 'id'));--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_composite" ON "customers" USING btree ("org_id","env","id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_org_env_internal_id" ON "customers" USING btree ("org_id","env","internal_id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_email_trgm" ON "customers" USING gin ("email" gin_trgm_ops) WHERE "customers"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops) WHERE "customers"."name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_id_trgm" ON "customers" USING gin ("id" gin_trgm_ops) WHERE "customers"."id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_org_id_env_created_at" ON "customers" USING btree ("org_id","env","created_at" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_processors_revenuecat" ON "customers" USING btree (("processors" ->> 'revenuecat'));--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_processors_vercel" ON "customers" USING btree (("processors" ->> 'vercel'));--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entities_internal_customer_id" ON "entities" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entities_customer_internal_desc" ON "entities" USING btree ("internal_customer_id","internal_id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entitlements_internal_product_id" ON "entitlements" USING btree ("internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_events_internal_customer_id" ON "events" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_events_internal_entity_id" ON "events" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_events_customer_non_usage_ts" ON "events" USING btree ("internal_customer_id","timestamp" DESC,"id" DESC) WHERE "events"."set_usage" = false;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_free_trials_internal_product_id" ON "free_trials" USING btree ("internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_invoices_customer_created" ON "invoices" USING btree ("internal_customer_id","created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_organizations_name_trgm" ON "organizations" USING gin ("name" gin_trgm_ops) WHERE "organizations"."name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_organizations_slug_trgm" ON "organizations" USING gin ("slug" gin_trgm_ops) WHERE "organizations"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_organizations_created_at_id" ON "organizations" USING btree ("createdAt" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_prices_internal_product_id" ON "prices" USING btree ("internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_prices_entitlement_id" ON "prices" USING btree ("entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_products_org_env_id_version" ON "products" USING btree ("org_id","env","id","version");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_referral_codes_internal_customer_id" ON "referral_codes" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_replaceables_cus_ent_id" ON "replaceables" USING btree ("cus_ent_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_reward_redemptions_referral_code_id" ON "reward_redemptions" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_rollovers_cus_ent_id" ON "rollovers" USING btree ("cus_ent_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_rollovers_cus_ent_expires" ON "rollovers" USING btree ("cus_ent_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "schedules_customer_scope_unique" ON "schedules" USING btree ("org_id","env","internal_customer_id") WHERE "schedules"."internal_entity_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "schedules_entity_scope_unique" ON "schedules" USING btree ("org_id","env","internal_customer_id","internal_entity_id") WHERE "schedules"."internal_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_schedules_internal_customer_id" ON "schedules" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_schedules_internal_entity_id" ON "schedules" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_user_name_trgm" ON "user" USING gin ("name" gin_trgm_ops) WHERE "user"."name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_user_email_trgm" ON "user" USING gin ("email" gin_trgm_ops) WHERE "user"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_user_created_at_id" ON "user" USING btree ("created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "verification_identifier_idx" ON "verification" USING btree ("identifier");
