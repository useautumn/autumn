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
ALTER TABLE "license_pools" ALTER COLUMN "plan_license_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "license_set_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "license_pools" ADD COLUMN "customer_product_license_id" text;--> statement-breakpoint
ALTER TABLE "customer_product_license" ADD CONSTRAINT "customer_product_license_parent_cp_fkey" FOREIGN KEY ("parent_customer_product_id") REFERENCES "public"."customer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_license" ADD CONSTRAINT "customer_product_license_license_product_fkey" FOREIGN KEY ("license_internal_product_id") REFERENCES "public"."products"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_product_license_license" ON "customer_product_license" USING btree ("license_internal_product_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_product_license_org_env" ON "customer_product_license" USING btree ("org_id","env");--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_customer_product_license_fkey" FOREIGN KEY ("customer_product_license_id") REFERENCES "public"."customer_product_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_license_pools_customer_product_license" ON "license_pools" USING btree ("customer_product_license_id");--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "unique_custom_license_pool" UNIQUE("parent_customer_product_id","customer_product_license_id");--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_source_check" CHECK (("license_pools"."plan_license_id" IS NULL) <> ("license_pools"."customer_product_license_id" IS NULL));