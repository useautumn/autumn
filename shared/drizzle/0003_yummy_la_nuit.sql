ALTER TABLE "events" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "api_version" numeric;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "org_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "proration_config" jsonb DEFAULT null;