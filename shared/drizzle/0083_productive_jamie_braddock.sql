CREATE TABLE "balance_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"lock_id" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"entity_id" text,
	"feature_id" text NOT NULL,
	"overage_behavior" text NOT NULL,
	"properties" jsonb,
	"deltas" jsonb NOT NULL,
	"expires_at" numeric NOT NULL,
	"expiry_action" text NOT NULL,
	"created_at" numeric NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "balance_locks_org_env_lock_id_key" ON "balance_locks" USING btree ("org_id","env","lock_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_balance_locks_internal_customer_id" ON "balance_locks" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_balance_locks_expires_at" ON "balance_locks" USING btree ("expires_at");