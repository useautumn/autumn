CREATE TABLE "approval_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
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
	"name" text NOT NULL,
	"effect" text NOT NULL,
	"position" integer NOT NULL,
	"actions" text[] NOT NULL,
	"filter" jsonb,
	"note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "approval_rules_effect_check" CHECK ("approval_rules"."effect" in ('allow', 'block'))
);
--> statement-breakpoint
CREATE TABLE "organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"label" text NOT NULL,
	"access" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "organization_role_org_role_key" UNIQUE("organization_id","role")
);
--> statement-breakpoint
ALTER TABLE "organization_role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_subjects" ADD CONSTRAINT "approval_rule_subjects_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_versions" ADD CONSTRAINT "approval_rule_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_decisions_org_created" ON "approval_decisions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_rule_subjects_lookup" ON "approval_rule_subjects" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_approval_rules_org_position" ON "approval_rules" USING btree ("org_id","position");