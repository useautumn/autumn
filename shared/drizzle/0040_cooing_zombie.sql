CREATE TABLE "license_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_entity_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"provisioned_customer_product_id" text,
	"started_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"ended_at" numeric,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
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
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_license" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"parent_internal_product_id" text NOT NULL,
	"parent_customer_product_id" text,
	"license_internal_product_id" text NOT NULL,
	"included" integer DEFAULT 0 NOT NULL,
	"prepaid_only" boolean DEFAULT true NOT NULL,
	"pooled_feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customize" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_plan_license" UNIQUE NULLS NOT DISTINCT("parent_internal_product_id","parent_customer_product_id","license_internal_product_id")
);
--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "license_assignment_id" text;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_entity_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_provisioned_customer_product_fkey" FOREIGN KEY ("provisioned_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_feature_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pool_grant" ADD CONSTRAINT "license_pool_grant_customer_entitlement_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_product_fkey" FOREIGN KEY ("parent_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_parent" ON "license_assignments" USING btree ("parent_customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_customer" ON "license_assignments" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_entity" ON "license_assignments" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_customer_license" ON "license_assignments" USING btree ("internal_customer_id","license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_active_parent" ON "license_assignments" USING btree ("parent_customer_product_id","license_internal_product_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_license_assignment_parent_entity" ON "license_assignments" USING btree ("parent_customer_product_id","internal_entity_id","license_internal_product_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_license_assignment_customer_entity_license" ON "license_assignments" USING btree ("org_id","env","internal_customer_id","internal_entity_id","license_internal_product_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_license_pool_grant" ON "license_pool_grant" USING btree ("org_id","env","internal_customer_id","license_internal_product_id","internal_feature_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_customer" ON "license_pool_grant" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pool_grant_license_product" ON "license_pool_grant" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent_product" ON "plan_license" USING btree ("parent_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent_customer_product" ON "plan_license" USING btree ("parent_customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_license" ON "plan_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_org_env" ON "plan_license" USING btree ("org_id","env");