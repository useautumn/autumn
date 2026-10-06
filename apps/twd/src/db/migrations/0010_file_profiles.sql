CREATE TABLE "file_profiles" (
	"file" text NOT NULL,
	"worker_class" text NOT NULL,
	"samples" integer NOT NULL,
	"stats_samples" integer DEFAULT 0 NOT NULL,
	"duration_mean_ms" real NOT NULL,
	"duration_variance" real DEFAULT 0 NOT NULL,
	"fail_rate" real DEFAULT 0 NOT NULL,
	"stripe_requests" real,
	"stripe_test_requests" real,
	"stripe_server_requests" real,
	"stripe_mean_rps" real,
	"stripe_peak_rps" real,
	"stripe_peak_in_flight" real,
	"worker_peak_rps" real,
	"worker_peak_in_flight" real,
	"rate_limited" real,
	"permit_wait_ms" real,
	"permit_wait_p95_ms" real,
	"cpu_core_seconds" real,
	"cpu_peak_cores" real,
	"mem_peak_mib" real,
	"test_cpu_seconds" real,
	"test_peak_mib" real,
	"last_run_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_profiles_file_worker_class_pk" PRIMARY KEY("file","worker_class")
);
--> statement-breakpoint
CREATE TABLE "file_run_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"file" text NOT NULL,
	"repetition" integer,
	"attempt" integer NOT NULL,
	"worker" text,
	"worker_class" text NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "file_run_stats_run_idx" ON "file_run_stats" USING btree ("run_id");