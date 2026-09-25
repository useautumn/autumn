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
CREATE TABLE "partition_progress" (
	"topic" text NOT NULL,
	"partition_id" integer NOT NULL,
	"next_offset" bigint NOT NULL,
	"command_next_offset" bigint,
	CONSTRAINT "partition_progress_pkey" PRIMARY KEY("topic","partition_id")
);
--> statement-breakpoint
ALTER TABLE "balance_locks" ADD CONSTRAINT "balance_locks_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "balance_locks_org_env_lock_id_key" ON "balance_locks" USING btree ("org_id","env","lock_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_balance_locks_internal_customer_id" ON "balance_locks" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_balance_locks_expires_at" ON "balance_locks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_pooled_balance_contributions_pending" ON "pooled_balance_contributions" USING btree ("pooled_balance_id") WHERE "pooled_balance_contributions"."effective_at" IS NOT NULL;