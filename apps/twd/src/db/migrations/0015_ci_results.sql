ALTER TABLE "file_baselines" ADD COLUMN "source" text DEFAULT 'swarm' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_results" ADD COLUMN "source" text DEFAULT 'swarm' NOT NULL;--> statement-breakpoint
CREATE INDEX "test_results_ci_idx" ON "test_results" USING btree ("branch","created_at") WHERE "test_results"."source" = 'ci';