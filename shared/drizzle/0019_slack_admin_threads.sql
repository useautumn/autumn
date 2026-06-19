CREATE TABLE IF NOT EXISTS "leaf"."slack_admin_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_installation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"org_id" text NOT NULL,
	"org_slug" text,
	"target_identifier" text NOT NULL,
	"created_by_provider_user_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "slack_admin_threads_thread_key" UNIQUE("workspace_id","channel_id","thread_id")
);
--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" DROP CONSTRAINT IF EXISTS "chat_oauth_credentials_installation_env_key";--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'chat_oauth_credentials_installation_org_env_key'
			AND conrelid = 'public.chat_oauth_credentials'::regclass
	) THEN
		ALTER TABLE "chat_oauth_credentials" ADD CONSTRAINT "chat_oauth_credentials_installation_org_env_key" UNIQUE("chat_installation_id","org_id","env");
	END IF;
END $$;
