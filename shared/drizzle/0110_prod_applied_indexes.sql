CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_keys_org_env_id" ON "api_keys" USING btree ("org_id","env","id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_entitlements_entitlement_id_c" ON "customer_entitlements" USING btree ("entitlement_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_license_entitlements_entitlement_id_c" ON "license_entitlements" USING btree ("entitlement_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_migration_item_runs_reporting" ON "migration_item_runs" USING btree ("migration_internal_id","item_kind","migration_run_id") INCLUDE ("status");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_oauth_refresh_token_token" ON "oauth_refresh_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_organizations_redis_configured" ON "organizations" USING btree ("id") WHERE "organizations"."redis_config" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_organizations_owner_sandbox_created" ON "organizations" USING btree ("created_by","is_sandbox","createdAt" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pooled_balance_contributions_source_product" ON "pooled_balance_contributions" USING btree ("source_customer_product_id");