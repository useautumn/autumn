CREATE TABLE "leaf"."harness_sessions" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"thread_key" text NOT NULL,
	"session_id" text NOT NULL,
	"resume_state" jsonb,
	"braintrust_parent" text,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "harness_sessions_org_id_env_thread_key_pk" PRIMARY KEY("org_id","env","thread_key")
);
--> statement-breakpoint
ALTER TABLE "chat_approvals" ADD COLUMN "harness" text;