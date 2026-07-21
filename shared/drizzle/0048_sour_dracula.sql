ALTER TABLE "pooled_balance_contributions" DROP CONSTRAINT "pooled_balance_contributions_reset_owner_type_valid";--> statement-breakpoint
ALTER TABLE "pooled_balances" DROP CONSTRAINT "pooled_balances_reset_mode_valid";--> statement-breakpoint
DROP INDEX CONCURRENTLY "idx_pooled_balance_contributions_reset_owner";--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "customer_license_link_id" text;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_stripe_subscription" ON "pooled_balance_contributions" USING btree ("stripe_subscription_id","pooled_balance_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_license_link" ON "pooled_balance_contributions" USING btree ("customer_license_link_id","pooled_balance_id");--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" DROP COLUMN "reset_owner_type";--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" DROP COLUMN "reset_owner_id";--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD CONSTRAINT "pooled_balance_contributions_single_owner" CHECK ("pooled_balance_contributions"."stripe_subscription_id" IS NULL OR "pooled_balance_contributions"."customer_license_link_id" IS NULL);--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "pooled_balances_reset_mode_valid" CHECK ("pooled_balances"."reset_mode" IN ('lazy', 'subscription'));
