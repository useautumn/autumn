CREATE TABLE "chat_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_ts" text,
	"provider_user_id" text NOT NULL,
	"env" text NOT NULL,
	"run_id" text,
	"tool_call_id" text,
	"tool_name" text NOT NULL,
	"tool_args" jsonb NOT NULL,
	"preview" jsonb,
	"status" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"expires_at" numeric NOT NULL,
	"decided_at" numeric,
	"decided_by_provider_user_id" text
);
--> statement-breakpoint
CREATE TABLE "chat_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"bot_user_id" text,
	"bot_access_token" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"default_env" text NOT NULL,
	"sandbox_api_key_id" text,
	"sandbox_api_key" text,
	"live_api_key_id" text,
	"live_api_key" text,
	"installed_by_user_id" text,
	"installed_by_provider_user_id" text,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "chat_installations_org_provider_key" UNIQUE("org_id","provider"),
	CONSTRAINT "chat_installations_provider_workspace_key" UNIQUE("provider","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "chat_approvals" ADD CONSTRAINT "chat_approvals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_installations" ADD CONSTRAINT "chat_installations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
