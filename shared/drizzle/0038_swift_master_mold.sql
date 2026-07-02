CREATE TABLE "license_pool_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"customer_entitlement_id" text NOT NULL,
	"period_granted_allowance" numeric DEFAULT 0 NOT NULL,
	"period_key" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_license_pool_grant" UNIQUE("org_id","env","internal_customer_id","license_internal_product_id","internal_feature_id")
);
--> statement-breakpoint
ALTER TABLE "customer_product_license" ADD COLUMN "pooled_feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_license" ADD COLUMN "pooled_feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_feature_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_entitlement_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_customer" ON "license_pool_grant" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_license_product" ON "license_pool_grant" USING btree ("license_internal_product_id");