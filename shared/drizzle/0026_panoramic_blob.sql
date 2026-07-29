ALTER TABLE "products" ADD COLUMN "auto_topups" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "spend_limits" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "usage_limits" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "usage_alerts" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "overage_allowed" jsonb;