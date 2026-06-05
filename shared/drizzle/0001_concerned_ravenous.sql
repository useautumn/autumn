CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text,
	CONSTRAINT "passkey_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "passkey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "migration_runs" ADD COLUMN "target_limit" numeric;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "passkey_credentialId_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_revenuecat_processor" ON "customer_products" USING btree ("internal_customer_id") WHERE ("customer_products"."processor" ->> 'type') = 'revenuecat';--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customers_cursor" ON "customers" USING btree ("org_id","env","created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entities_cursor" ON "entities" USING btree ("org_id","env","created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_entitlements_internal_reward_id_c_partial" ON "entitlements" USING btree ("internal_reward_id" COLLATE "C") WHERE "entitlements"."internal_reward_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "vercel_resources_installation_name_unique_idx" ON "vercel_resources" USING btree ("org_id","env","installation_id","name") WHERE status <> 'uninstalled';