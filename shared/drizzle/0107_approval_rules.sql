CREATE TABLE "approval_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"request_id" text,
	"action" text NOT NULL,
	"user_id" text,
	"role" text,
	"verdict" text NOT NULL,
	"enforced" boolean NOT NULL,
	"decided_by" jsonb,
	"rule_version" integer,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rule_subjects" (
	"rule_id" text NOT NULL,
	"org_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	CONSTRAINT "approval_rule_subjects_pkey" PRIMARY KEY("rule_id","subject_type","subject_id")
);
--> statement-breakpoint
CREATE TABLE "approval_rule_versions" (
	"rule_id" text NOT NULL,
	"org_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "approval_rule_versions_pkey" PRIMARY KEY("rule_id","version")
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"name" text NOT NULL,
	"actions" text[] NOT NULL,
	"when" jsonb,
	"note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "approval_rules_live_only" CHECK ("approval_rules"."env" = 'live')
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_subjects" ADD CONSTRAINT "approval_rule_subjects_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_versions" ADD CONSTRAINT "approval_rule_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_decisions_org_env_created" ON "approval_decisions" USING btree ("org_id","env","created_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_rule_subjects_lookup" ON "approval_rule_subjects" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_rules_org_env" ON "approval_rules" USING btree ("org_id","env");