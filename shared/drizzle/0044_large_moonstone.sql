CREATE TABLE "transition_rules" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"carry_over_usages" jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "transition_rules_pkey" PRIMARY KEY("org_id","env")
);
--> statement-breakpoint
ALTER TABLE "transition_rules" ADD CONSTRAINT "transition_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;