CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"via" text NOT NULL,
	"note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_account_id" text NOT NULL,
	"state" text DEFAULT 'clean' NOT NULL,
	"held_by" text,
	"run_id" text,
	"reservation_id" text,
	"reserved_until" timestamp with time zone,
	"last_nuked_at" timestamp with time zone,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"singleton_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"fencing_token" bigint DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "key_gate" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"job_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_keys" (
	"platform_account_id" text PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"key_hint" text NOT NULL,
	"display_name" text,
	"usable" boolean DEFAULT false NOT NULL,
	"unusable_reason" text,
	"connect_webhook_id" text,
	"probe" jsonb,
	"probed_at" timestamp with time zone,
	"present" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "file_baselines" (
	"file" text PRIMARY KEY NOT NULL,
	"p50_ms" integer NOT NULL,
	"p90_ms" integer NOT NULL,
	"pass_rate" real NOT NULL,
	"samples" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text NOT NULL,
	"file" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"passed_tests" integer DEFAULT 0 NOT NULL,
	"failed_tests" integer DEFAULT 0 NOT NULL,
	"worker" text,
	"failure_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"branch" text NOT NULL,
	"sha" text NOT NULL,
	"selection" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"purpose" text DEFAULT 'adhoc' NOT NULL,
	"reservation_id" text,
	"job_id" text,
	"file_count" integer,
	"worker_count" integer,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warm_images" (
	"sha" text PRIMARY KEY NOT NULL,
	"branch" text NOT NULL,
	"status" text NOT NULL,
	"job_id" text,
	"image_tag" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_platform_account_id_stripe_keys_platform_account_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."stripe_keys"("platform_account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_accounts_state_idx" ON "stripe_accounts" USING btree ("state","platform_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_live_singleton_idx" ON "jobs" USING btree ("singleton_key") WHERE status in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "test_results_file_branch_idx" ON "test_results" USING btree ("file","branch","created_at");--> statement-breakpoint
CREATE INDEX "test_results_run_idx" ON "test_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "runs_branch_idx" ON "runs" USING btree ("branch","created_at");