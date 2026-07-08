ALTER TABLE "usage_windows" ADD COLUMN "filter_key" text;--> statement-breakpoint
DROP INDEX CONCURRENTLY "idx_usage_windows_customer_feature_scope";--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "idx_usage_windows_customer_feature_scope" ON "usage_windows" USING btree ("internal_customer_id","internal_feature_id",COALESCE("internal_entity_id", ''),COALESCE("filter_key", ''));
