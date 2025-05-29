-- CREATE TABLE "events" (
-- 	"id" text PRIMARY KEY NOT NULL,
-- 	"org_id" text NOT NULL,
-- 	"internal_customer_id" text,
-- 	"env" text NOT NULL,
-- 	"created_at" bigint,
-- 	"timestamp" numeric,
-- 	"event_name" text NOT NULL,
-- 	"idempotency_key" text DEFAULT null,
-- 	"value" numeric,
-- 	"set_usage" boolean DEFAULT false,
-- 	"entity_id" text,
-- 	"customer_id" text NOT NULL,
-- 	"properties" jsonb,
-- 	CONSTRAINT "unique_event_constraint" UNIQUE("org_id","env","customer_id","event_name","idempotency_key")
-- );
-- --> statement-breakpoint
-- ALTER TABLE "events" ADD CONSTRAINT "events_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "events" ADD COLUMN "created_at" bigint;
