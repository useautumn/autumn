CREATE TABLE "customer_licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"granted" numeric DEFAULT 0 NOT NULL,
	"remaining" numeric DEFAULT 0 NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_license_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_pool_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"customer_entitlement_id" text,
	"period_granted_allowance" numeric DEFAULT 0 NOT NULL,
	"period_key" numeric,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_license_id" text NOT NULL,
	"price_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_license" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_internal_product_id" text NOT NULL,
	"parent_customer_product_id" text,
	"license_internal_product_id" text NOT NULL,
	"included" integer DEFAULT 0 NOT NULL,
	"prepaid_only" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_plan_license" UNIQUE NULLS NOT DISTINCT("parent_internal_product_id","parent_customer_product_id","license_internal_product_id")
);
--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "license_parent_customer_product_id" text;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "pooled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_entitlements" ADD CONSTRAINT "license_entitlements_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_entitlements" ADD CONSTRAINT "license_entitlements_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_feature_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_entitlement_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_prices" ADD CONSTRAINT "license_prices_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_prices" ADD CONSTRAINT "license_prices_price_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_product_fkey" FOREIGN KEY ("parent_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_customer_license" ON "customer_licenses" USING btree ("parent_customer_product_id","license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_licenses_customer" ON "customer_licenses" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_entitlement" ON "license_entitlements" USING btree ("plan_license_id","entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_entitlements_entitlement" ON "license_entitlements" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_pool_grant" ON "license_pool_grant" USING btree ("internal_customer_id","parent_customer_product_id","license_internal_product_id","internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_customer" ON "license_pool_grant" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_license_product" ON "license_pool_grant" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_customer_entitlement" ON "license_pool_grant" USING btree ("customer_entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_price" ON "license_prices" USING btree ("plan_license_id","price_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_prices_price" ON "license_prices" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent_product" ON "plan_license" USING btree ("parent_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent_customer_product" ON "plan_license" USING btree ("parent_customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_license" ON "plan_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_license_parent" ON "customer_products" USING btree ("license_parent_customer_product_id") WHERE "customer_products"."license_parent_customer_product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_license_assignment" ON "customer_products" USING btree ("license_parent_customer_product_id","internal_entity_id","internal_product_id") WHERE "customer_products"."license_parent_customer_product_id" IS NOT NULL AND "customer_products"."internal_entity_id" IS NOT NULL AND "customer_products"."status" IN ('active', 'past_due', 'trialing');