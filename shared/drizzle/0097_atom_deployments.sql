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
	"stages" jsonb NOT NULL,
	"error" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "atom_deployments_deployment_group_id_key" UNIQUE("deployment_group_id"),
	CONSTRAINT "atom_deployments_org_id_env_key" UNIQUE("org_id","env"),
	CONSTRAINT "atom_deployments_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "atom_deployments" ADD CONSTRAINT "atom_deployments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "atom_deployments" (
	"id", "org_id", "env", "deployment_group_id", "deployment_id", "status", "endpoint_url",
	"cpu", "memory", "encrypted_token", "token_hash", "region", "network", "stages", "error", "created_at"
)
SELECT
	'atom_' || md5(o."id" || '.' || e."env"),
	o."id",
	e."env",
	e."cache"->>'deployment_group_id',
	e."cache"->>'deployment_id',
	e."cache"->>'status',
	e."cache"->>'endpoint_url',
	(e."cache"->>'cpu')::integer,
	(e."cache"->>'memory')::integer,
	e."cache"->>'encrypted_token',
	e."cache"->>'token_hash',
	e."cache"->>'region',
	NULLIF(e."cache"->'network', 'null'::jsonb),
	COALESCE(
		NULLIF(e."cache"->'stages', 'null'::jsonb),
		'{"stack":"waiting","disk":"waiting","machine":"waiting","load_balancer":"waiting","atom":"waiting","connected":"waiting"}'::jsonb
	),
	e."cache"->>'error',
	(e."cache"->>'created_at')::bigint
FROM "organizations" o
CROSS JOIN LATERAL (
	VALUES ('sandbox', o."sandbox_byoc_config"->'cache'), ('live', o."live_byoc_config"->'cache')
) AS e("env", "cache")
WHERE jsonb_typeof(e."cache") = 'object'
ON CONFLICT DO NOTHING;
