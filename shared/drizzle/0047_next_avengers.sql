CREATE TABLE "pooled_balance_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"pooled_balance_id" text NOT NULL,
	"source_customer_product_id" text NOT NULL,
	"source_customer_entitlement_id" text NOT NULL,
	"current_contribution" numeric DEFAULT 0 NOT NULL,
	"next_cycle_contribution" numeric DEFAULT 0 NOT NULL,
	"effective_at" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_pooled_balance_contribution" UNIQUE("source_customer_entitlement_id"),
	CONSTRAINT "pooled_balance_contributions_current_non_negative" CHECK ("pooled_balance_contributions"."current_contribution" >= 0),
	CONSTRAINT "pooled_balance_contributions_next_non_negative" CHECK ("pooled_balance_contributions"."next_cycle_contribution" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pooled_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"granted" numeric DEFAULT 0 NOT NULL,
	"interval" text NOT NULL,
	"interval_count" numeric DEFAULT 1 NOT NULL,
	"reset_cycle_anchor" numeric,
	"reset_mode" text NOT NULL,
	"stripe_subscription_id" text,
	"customer_license_link_id" text,
	"rollover_signature" text DEFAULT 'none' NOT NULL,
	"customer_entitlement_id" text NOT NULL,
	"last_applied_reset_at" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_pooled_balance" UNIQUE NULLS NOT DISTINCT("internal_customer_id","internal_feature_id","interval","interval_count","reset_cycle_anchor","reset_mode","stripe_subscription_id","customer_license_link_id","rollover_signature"),
	CONSTRAINT "unique_pooled_balance_customer_entitlement" UNIQUE("customer_entitlement_id"),
	CONSTRAINT "pooled_balances_interval_count_positive" CHECK ("pooled_balances"."interval_count" > 0),
	CONSTRAINT "pooled_balances_granted_non_negative" CHECK ("pooled_balances"."granted" >= 0),
	CONSTRAINT "pooled_balances_reset_mode_valid" CHECK ("pooled_balances"."reset_mode" IN ('lazy', 'subscription', 'lifetime')),
	CONSTRAINT "pooled_balances_lifecycle_ids_valid" CHECK ((
				"pooled_balances"."reset_mode" = 'subscription'
				AND "pooled_balances"."stripe_subscription_id" IS NOT NULL
				AND "pooled_balances"."customer_license_link_id" IS NULL
			) OR (
				"pooled_balances"."reset_mode" = 'lazy'
				AND "pooled_balances"."stripe_subscription_id" IS NULL
			) OR (
				"pooled_balances"."reset_mode" = 'lifetime'
				AND "pooled_balances"."stripe_subscription_id" IS NULL
				AND "pooled_balances"."customer_license_link_id" IS NULL
			))
);
--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD COLUMN "is_pooled_balance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "pooled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_pool_fkey" FOREIGN KEY ("pooled_balance_id") REFERENCES "public"."pooled_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_customer_product_fkey" FOREIGN KEY ("source_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_customer_entitlement_fkey" FOREIGN KEY ("source_customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_feature_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_customer_entitlement_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_pool" ON "pooled_balance_contributions" USING btree ("pooled_balance_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_source_customer_entitlement" ON "pooled_balance_contributions" USING btree ("source_customer_entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_org" ON "pooled_balances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_reset_mode" ON "pooled_balances" USING btree ("internal_customer_id","reset_mode");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_feature" ON "pooled_balances" USING btree ("internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_stripe_subscription" ON "pooled_balances" USING btree ("internal_customer_id","stripe_subscription_id") WHERE "pooled_balances"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_customer_license" ON "pooled_balances" USING btree ("internal_customer_id","customer_license_link_id") WHERE "pooled_balances"."customer_license_link_id" IS NOT NULL;
