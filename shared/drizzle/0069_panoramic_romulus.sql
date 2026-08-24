ALTER TABLE "products" ADD COLUMN "deleted_at" numeric;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "previous_version_slug" text;