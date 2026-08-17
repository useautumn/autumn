ALTER TABLE "oauth_access_token" ADD COLUMN "resource" text;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "resource" text;