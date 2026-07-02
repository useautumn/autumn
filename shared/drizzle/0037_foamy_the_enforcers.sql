CREATE TABLE "customer_product_license" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"included_quantity" integer DEFAULT 0 NOT NULL,
	"allow_extra_quantity" boolean DEFAULT false NOT NULL,
	"customize" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_customer_product_license" UNIQUE("parent_customer_product_id","license_internal_product_id")
);
--> statement-breakpoint
CREATE TABLE "license_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"license_pool_id" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_entity_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"provisioned_customer_product_id" text,
	"started_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"ended_at" numeric,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "license_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"internal_customer_id" text NOT NULL,
	"parent_customer_product_id" text NOT NULL,
	"plan_license_id" text,
	"customer_product_license_id" text,
	"license_internal_product_id" text NOT NULL,
	"license_customer_product_id" text,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_license_pool" UNIQUE("parent_customer_product_id","plan_license_id"),
	CONSTRAINT "unique_custom_license_pool" UNIQUE("parent_customer_product_id","customer_product_license_id"),
	CONSTRAINT "license_pools_source_check" CHECK (("license_pools"."plan_license_id" IS NULL) <> ("license_pools"."customer_product_license_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "plan_license" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"parent_internal_product_id" text NOT NULL,
	"license_internal_product_id" text NOT NULL,
	"included_quantity" integer DEFAULT 0 NOT NULL,
	"allow_extra_quantity" boolean DEFAULT false NOT NULL,
	"customize" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	"updated_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "unique_plan_license" UNIQUE("parent_internal_product_id","license_internal_product_id")
);
--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "license_set_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "catalog_type" text DEFAULT 'plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_product_license" ADD CONSTRAINT "customer_product_license_parent_cp_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_license" ADD CONSTRAINT "customer_product_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_pool_fkey" FOREIGN KEY ("license_pool_id") REFERENCES "public"."license_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_entity_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_provisioned_customer_product_fkey" FOREIGN KEY ("provisioned_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_customer_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_parent_customer_product_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_plan_license_fkey" FOREIGN KEY ("plan_license_id") REFERENCES "public"."plan_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_customer_product_license_fkey" FOREIGN KEY ("customer_product_license_id") REFERENCES "public"."customer_product_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_license_customer_product_fkey" FOREIGN KEY ("license_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_parent_product_fkey" FOREIGN KEY ("parent_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_license" ADD CONSTRAINT "plan_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_product_license_license" ON "customer_product_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_product_license_org_env" ON "customer_product_license" USING btree ("org_id","env");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_pool" ON "license_assignments" USING btree ("license_pool_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_customer" ON "license_assignments" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_entity" ON "license_assignments" USING btree ("internal_entity_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_customer_license" ON "license_assignments" USING btree ("internal_customer_id","license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_assignments_active_pool" ON "license_assignments" USING btree ("license_pool_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_license_assignment_pool_entity" ON "license_assignments" USING btree ("license_pool_id","internal_entity_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_license_assignment_customer_entity_license" ON "license_assignments" USING btree ("org_id","env","internal_customer_id","internal_entity_id","license_internal_product_id") WHERE "license_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_customer" ON "license_pools" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_parent_cp" ON "license_pools" USING btree ("parent_customer_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_license_product" ON "license_pools" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_customer_product_license" ON "license_pools" USING btree ("customer_product_license_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_customer_license" ON "license_pools" USING btree ("internal_customer_id","license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_org_env_customer" ON "license_pools" USING btree ("org_id","env","internal_customer_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_parent" ON "plan_license" USING btree ("parent_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_license" ON "plan_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_plan_license_org_env" ON "plan_license" USING btree ("org_id","env");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_products_org_env_catalog_id_version" ON "products" USING btree ("org_id","env","catalog_type","id","version");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_catalog_type_check" CHECK ("products"."catalog_type" in ('plan', 'license'));