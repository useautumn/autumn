ALTER TABLE "customer_exports" ADD COLUMN "kind" text DEFAULT 'customers' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "customer_exports_active_per_org_env_kind_unique" ON "customer_exports" USING btree ("org_id","env","kind") WHERE "customer_exports"."status" IN ('queued', 'running');--> statement-breakpoint
DROP INDEX CONCURRENTLY "customer_exports_active_per_org_env_unique";
