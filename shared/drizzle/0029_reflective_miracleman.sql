CREATE INDEX CONCURRENTLY "idx_customer_entitlements_internal_feature_id_c" ON "customer_entitlements" USING btree ("internal_feature_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entitlements_internal_feature_id_c" ON "entitlements" USING btree ("internal_feature_id" COLLATE "C");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entities_internal_feature_id_c" ON "entities" USING btree ("internal_feature_id" COLLATE "C") WHERE "entities"."internal_feature_id" IS NOT NULL;
