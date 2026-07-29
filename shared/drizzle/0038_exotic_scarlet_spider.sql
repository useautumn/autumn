CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ce_internal_feature_id" ON "customer_entitlements" USING btree ("internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ce_customer_product_id_c" ON "customer_entitlements" USING btree ("customer_product_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ce_loose_next_reset" ON "customer_entitlements" USING btree ("next_reset_at") WHERE "customer_entitlements"."customer_product_id" IS NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_entitlements_nonnull_entity_by_id" ON "customer_entitlements" USING btree ("id") WHERE "customer_entitlements"."internal_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cpr_customer_product_id_c" ON "customer_prices" USING btree ("customer_product_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_products_customer_status_created_at" ON "customer_products" USING btree ("internal_customer_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_products_product_status" ON "customer_products" USING btree ("internal_product_id","status");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_products_ended_at" ON "customer_products" USING btree ("ended_at") WHERE "customer_products"."status" IN ('active', 'past_due') AND "customer_products"."ended_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_products_trial_ends_at" ON "customer_products" USING btree ("trial_ends_at") WHERE "customer_products"."status" IN ('active', 'past_due') AND "customer_products"."trial_ends_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_products_product_id" ON "customer_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entities_internal_feature_id" ON "entities" USING btree ("internal_feature_id") WHERE "entities"."internal_feature_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entitlements_internal_feature_id" ON "entitlements" USING btree ("internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_events_timestamp" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_features_composite" ON "features" USING btree ("org_id","env");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_invoice_line_items_stripe_invoice_id" ON "invoice_line_items" USING btree ("stripe_invoice_id") WHERE "invoice_line_items"."stripe_invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_invoice_line_items_invoice_id" ON "invoice_line_items" USING btree ("invoice_id") WHERE "invoice_line_items"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_invoice_line_items_stripe_invoice_item_id" ON "invoice_line_items" USING btree ("stripe_invoice_item_id") WHERE "invoice_line_items"."stripe_invoice_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_metadata_on_type_expires_at" ON "metadata" USING btree ("type","expires_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "metadata_expires_at_idx" ON "metadata" USING btree ("expires_at") WHERE "metadata"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_uw_internal_feature_id" ON "usage_windows" USING btree ("internal_feature_id");