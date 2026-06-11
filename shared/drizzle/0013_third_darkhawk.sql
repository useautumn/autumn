CREATE SCHEMA "leaf";
--> statement-breakpoint
CREATE TABLE "leaf"."cma_memory" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"memory_store_id" text NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "cma_memory_org_id_env_pk" PRIMARY KEY("org_id","env")
);
--> statement-breakpoint
CREATE TABLE "leaf"."cma_sessions" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"thread_key" text NOT NULL,
	"session_id" text NOT NULL,
	"braintrust_parent" text,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "cma_sessions_org_id_env_thread_key_pk" PRIMARY KEY("org_id","env","thread_key")
);
--> statement-breakpoint
CREATE TABLE "leaf"."cma_vaults" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"vault_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "cma_vaults_org_id_env_pk" PRIMARY KEY("org_id","env")
);
