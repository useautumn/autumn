CREATE TABLE "chat_oauth_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_installation_id" text NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"oauth_client_id" text NOT NULL,
	"oauth_consent_id" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" numeric NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "chat_oauth_credentials_installation_env_key" UNIQUE("chat_installation_id","env")
);
--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" ADD CONSTRAINT "chat_oauth_credentials_installation_id_fkey" FOREIGN KEY ("chat_installation_id") REFERENCES "public"."chat_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" ADD CONSTRAINT "chat_oauth_credentials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;