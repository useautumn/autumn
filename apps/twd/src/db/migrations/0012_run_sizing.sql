ALTER TABLE "file_profiles" ADD COLUMN "packed_samples" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_profiles" ADD COLUMN "packed_fail_rate" real;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "max_files_per_worker" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "sizing" jsonb;