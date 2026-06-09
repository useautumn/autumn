ALTER TABLE "oauth_consent" ADD COLUMN "env" text;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "redirect_uri" text;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "oauth_api_key_id" text;
