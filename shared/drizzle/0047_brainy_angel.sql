CREATE TABLE "pooled_balance_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"pooled_balance_id" text NOT NULL,
	"source_customer_product_id" text NOT NULL,
	"source_entitlement_id" text NOT NULL,
	"reset_owner_type" text NOT NULL,
	"reset_owner_id" text NOT NULL,
	"current_contribution" numeric DEFAULT 0 NOT NULL,
	"next_cycle_contribution" numeric DEFAULT 0 NOT NULL,
	"effective_at" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_pooled_balance_contribution" UNIQUE("source_customer_product_id","source_entitlement_id"),
	CONSTRAINT "pooled_balance_contributions_current_non_negative" CHECK ("pooled_balance_contributions"."current_contribution" >= 0),
	CONSTRAINT "pooled_balance_contributions_next_non_negative" CHECK ("pooled_balance_contributions"."next_cycle_contribution" >= 0),
	CONSTRAINT "pooled_balance_contributions_reset_owner_type_valid" CHECK ("pooled_balance_contributions"."reset_owner_type" IN ('customer_product', 'subscription', 'free'))
);
--> statement-breakpoint
CREATE TABLE "pooled_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"interval" text NOT NULL,
	"interval_count" numeric DEFAULT 1 NOT NULL,
	"reset_cycle_anchor" numeric,
	"reset_mode" text NOT NULL,
	"rollover_signature" text DEFAULT 'none' NOT NULL,
	"price_id" text,
	"entitlement_id" text NOT NULL,
	"customer_entitlement_id" text NOT NULL,
	"last_applied_reset_at" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_pooled_balance" UNIQUE NULLS NOT DISTINCT("internal_customer_id","internal_feature_id","interval","interval_count","reset_cycle_anchor","reset_mode","rollover_signature","price_id"),
	CONSTRAINT "unique_pooled_balance_entitlement" UNIQUE("entitlement_id"),
	CONSTRAINT "unique_pooled_balance_customer_entitlement" UNIQUE("customer_entitlement_id"),
	CONSTRAINT "pooled_balances_interval_count_positive" CHECK ("pooled_balances"."interval_count" > 0),
	CONSTRAINT "pooled_balances_reset_mode_valid" CHECK ("pooled_balances"."reset_mode" IN ('lazy', 'subscription', 'lifetime'))
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "pooled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_pool_fkey" FOREIGN KEY ("pooled_balance_id") REFERENCES "public"."pooled_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_customer_product_fkey" FOREIGN KEY ("source_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_entitlement_fkey" FOREIGN KEY ("source_entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_feature_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_price_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_customer_entitlement_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE restrict ON UPDATE no action;