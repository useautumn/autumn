ALTER TABLE "actions" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ALTER COLUMN "timestamp" SET DEFAULT now();