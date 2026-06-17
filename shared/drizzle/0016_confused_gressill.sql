ALTER TABLE "customer_entitlements" ADD COLUMN "separate_interval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_entitlements" ADD COLUMN "reset_cycle_anchor" numeric;--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "billing_cycle_anchor" numeric;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_entitlements_separate_interval_reset" ON "customer_entitlements" USING btree ("next_reset_at","id") WHERE "customer_entitlements"."separate_interval" = true AND "customer_entitlements"."next_reset_at" IS NOT NULL;
