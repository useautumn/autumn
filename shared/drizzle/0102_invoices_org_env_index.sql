DROP INDEX CONCURRENTLY IF EXISTS "idx_invoices_org_env_created";--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_invoices_org_env_created" ON "invoices" USING btree ("org_id","env","created_at" DESC,"id" DESC);
