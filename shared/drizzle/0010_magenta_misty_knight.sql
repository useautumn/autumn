CREATE TABLE "agent_rules" (
	"org_id" text PRIMARY KEY NOT NULL,
	"org_slug" text NOT NULL,
	"entity_rules" jsonb NOT NULL,
	"credit_rules" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_rules" ADD CONSTRAINT "agent_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
