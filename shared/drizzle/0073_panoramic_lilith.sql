CREATE TABLE "billing_operations" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"operation_id" text NOT NULL,
	"billing_action" text NOT NULL,
	"canonical_request_hash" text NOT NULL,
	"canonical_request" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"expires_at" numeric NOT NULL,
	CONSTRAINT "billing_operations_org_env_operation_id_key" UNIQUE("org_id","env","operation_id")
);
