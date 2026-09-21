CREATE TABLE "migration_batch_results" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"batch_id" text NOT NULL,
	"version" integer NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"created_at" numeric NOT NULL,
	CONSTRAINT "migration_batch_results_org_id_env_batch_id_pk" PRIMARY KEY("org_id","env","batch_id")
);
--> statement-breakpoint
ALTER TABLE "migration_batch_results" ADD CONSTRAINT "migration_batch_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;