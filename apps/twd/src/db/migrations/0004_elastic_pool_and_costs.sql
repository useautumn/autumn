CREATE TABLE "run_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"name" text NOT NULL,
	"sandbox_id" text,
	"account_id" text,
	"cores" real NOT NULL,
	"memory_gib" real NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "reservations" CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "workers_wanted" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "cost_usd" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "worker_seconds" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "warm_images" ADD COLUMN "build_seconds" real;--> statement-breakpoint
ALTER TABLE "warm_images" ADD COLUMN "cost_usd" real;--> statement-breakpoint
ALTER TABLE "warm_images" ADD COLUMN "created_by" text;--> statement-breakpoint
CREATE INDEX "run_workers_run_idx" ON "run_workers" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_workers_started_idx" ON "run_workers" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "stripe_accounts" DROP COLUMN "reservation_id";--> statement-breakpoint
ALTER TABLE "stripe_accounts" DROP COLUMN "reserved_until";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "reservation_id";