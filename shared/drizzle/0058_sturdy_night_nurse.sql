CREATE TABLE "customer_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"status" text NOT NULL,
	"fields" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"requested_by_user_id" text,
	"trigger_run_id" text,
	"s3_key" text,
	"s3_upload_id" text,
	"partition_plan" jsonb,
	"row_count" numeric,
	"byte_count" numeric,
	"error_message" text,
	"created_at" numeric NOT NULL,
	"started_at" numeric,
	"completed_at" numeric
);
--> statement-breakpoint
ALTER TABLE "customer_exports" ADD CONSTRAINT "customer_exports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_exports_org_env_created_at" ON "customer_exports" USING btree ("org_id","env","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "customer_exports_active_per_org_env_unique" ON "customer_exports" USING btree ("org_id","env") WHERE "customer_exports"."status" IN ('queued', 'running');