CREATE TABLE "ledger_subject_versions" (
	"internal_customer_id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"partition" integer NOT NULL,
	"kafka_offset" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_subject_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_lsns_updated_at" ON "customer_lsns" USING btree ("updated_at");