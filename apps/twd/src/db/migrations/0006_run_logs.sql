CREATE TABLE "run_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"file" text,
	"worker" text,
	"chunk" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_logs_run_file_idx" ON "run_logs" USING btree ("run_id","file","id");--> statement-breakpoint
CREATE INDEX "run_logs_run_worker_idx" ON "run_logs" USING btree ("run_id","worker","id");--> statement-breakpoint
CREATE INDEX "run_logs_created_idx" ON "run_logs" USING btree ("created_at");