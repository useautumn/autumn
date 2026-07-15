CREATE TABLE "customer_licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"plan_license_id" text,
	"granted" numeric DEFAULT 0 NOT NULL,
	"remaining" numeric DEFAULT 0 NOT NULL,
	"paid_quantity" numeric DEFAULT 0 NOT NULL,
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
	"license_internal_product_id" text NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"included" integer DEFAULT 0 NOT NULL,
	"prepaid_only" boolean DEFAULT true NOT NULL,
	"customized" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "customer_license_link_id" text;--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "released_at" numeric;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD CONSTRAINT "customer_licenses_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_entitlements" ADD CONSTRAINT "license_entitlements_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_entitlements" ADD CONSTRAINT "license_entitlements_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_prices" ADD CONSTRAINT "license_prices_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_prices" ADD CONSTRAINT "license_prices_price_fkey" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_product_fkey" FOREIGN KEY ("parent_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_licenses_plan_license" ON "customer_licenses" USING btree ("plan_license_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_customer_license" ON "customer_licenses" USING btree ("parent_customer_product_id","license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_licenses_customer" ON "customer_licenses" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_licenses_link" ON "customer_licenses" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_entitlement" ON "license_entitlements" USING btree ("plan_license_id","entitlement_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_entitlements_entitlement" ON "license_entitlements" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_price" ON "license_prices" USING btree ("plan_license_id","price_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_prices_price" ON "license_prices" USING btree ("price_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_plan_license" ON "plan_license" USING btree ("parent_internal_product_id","license_internal_product_id") WHERE "plan_license"."is_custom" = false;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent_product" ON "plan_license" USING btree ("parent_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_license" ON "plan_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_customer_license" ON "customer_products" USING btree ("customer_license_link_id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_license_seat_order" ON "customer_products" USING btree ("customer_license_link_id","created_at","id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_unused_seats" ON "customer_products" USING btree ("customer_license_link_id","released_at") WHERE "customer_products"."customer_license_link_id" IS NOT NULL AND "customer_products"."internal_entity_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_pool_assignment" ON "customer_products" USING btree ("customer_license_link_id","internal_entity_id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL AND "customer_products"."internal_entity_id" IS NOT NULL AND "customer_products"."status" IN ('active', 'past_due');