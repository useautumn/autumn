CREATE INDEX CONCURRENTLY "idx_entities_customer_created_at" ON "entities" USING btree ("internal_customer_id","created_at" DESC,"id" DESC);
