SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "pooled_balances" DROP CONSTRAINT "unique_pooled_balance";--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD CONSTRAINT "unique_pooled_balance" UNIQUE USING INDEX "unique_pooled_balance_with_feature_override";
