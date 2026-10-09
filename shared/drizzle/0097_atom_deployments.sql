CREATE TABLE "atom_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"deployment_group_id" text NOT NULL,
	"deployment_id" text,
	"status" text NOT NULL,
	"endpoint_url" text,
	"cpu" integer,
	"memory" integer,
	"encrypted_token" text NOT NULL,
	"token_hash" text,
	"region" text,
	"network" jsonb,
	"stack_name" text,
	"stages" jsonb NOT NULL,
	"first_check_at" bigint,
	"error" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "atom_deployments_deployment_group_id_key" UNIQUE("deployment_group_id"),
	CONSTRAINT "atom_deployments_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "atom_deployments" ADD CONSTRAINT "atom_deployments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atom_deployments_active_org_id_env_key" ON "atom_deployments" USING btree ("org_id","env") WHERE "atom_deployments"."status" NOT IN ('removing', 'teardown_required');