ALTER TABLE "pooled_balances" DROP CONSTRAINT "unique_pooled_balance";--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "competes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD COLUMN "feature_override_signature" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "unique_pooled_balance" UNIQUE NULLS NOT DISTINCT("internal_customer_id","internal_feature_id","unlimited","interval","interval_count","reset_cycle_anchor","reset_mode","stripe_subscription_id","customer_license_link_id","rollover_signature","feature_override_signature","expires_at");