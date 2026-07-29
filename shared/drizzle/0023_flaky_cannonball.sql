CREATE TABLE "leaf"."chat_thread_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_installation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"org_id" text NOT NULL,
	"org_slug" text,
	"source" text NOT NULL,
	"target_identifier" text,
	"created_by_provider_user_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "chat_thread_contexts_thread_key" UNIQUE("workspace_id","channel_id","thread_id")
);
