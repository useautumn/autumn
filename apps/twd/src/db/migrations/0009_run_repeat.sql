ALTER TABLE "test_results" ADD COLUMN "repetition" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "repeat" integer DEFAULT 1 NOT NULL;