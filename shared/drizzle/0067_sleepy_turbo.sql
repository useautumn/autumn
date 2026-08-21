CREATE TABLE "chat_approval_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"position" numeric NOT NULL,
	"request_id" text,
	"deny_option_id" text,
	"tool_name" text NOT NULL,
	"tool_args" jsonb NOT NULL,
	"preview" jsonb,
	"status" text NOT NULL,
	"result" jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "chat_approval_steps_approval_position_key" UNIQUE("approval_id","position")
);
--> statement-breakpoint
ALTER TABLE "chat_approvals" ADD COLUMN "child_session_ids" text[];--> statement-breakpoint
ALTER TABLE "chat_approvals" ADD COLUMN "approve_option_id" text;--> statement-breakpoint
ALTER TABLE "chat_approvals" ADD COLUMN "deny_option_id" text;--> statement-breakpoint
ALTER TABLE "chat_approval_steps" ADD CONSTRAINT "chat_approval_steps_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "public"."chat_approvals"("id") ON DELETE cascade ON UPDATE no action;