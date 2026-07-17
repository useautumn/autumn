CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_pool" ON "pooled_balance_contributions" USING btree ("pooled_balance_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_source_entitlement" ON "pooled_balance_contributions" USING btree ("source_entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_reset_owner" ON "pooled_balance_contributions" USING btree ("reset_owner_type","reset_owner_id","pooled_balance_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_reset_mode" ON "pooled_balances" USING btree ("internal_customer_id","reset_mode");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_feature" ON "pooled_balances" USING btree ("internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balances_price" ON "pooled_balances" USING btree ("price_id");