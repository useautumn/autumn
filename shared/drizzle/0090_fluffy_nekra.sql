ALTER TABLE "organizations" ADD COLUMN "sandbox_byoc_config" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "live_byoc_config" jsonb DEFAULT '{}'::jsonb;