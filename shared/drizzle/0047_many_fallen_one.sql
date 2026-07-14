DROP INDEX "idx_customer_products_customer_license";--> statement-breakpoint
DROP INDEX "unique_active_pool_assignment";--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD COLUMN "link_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_licenses" ADD COLUMN "paid_quantity" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_products" ADD COLUMN "customer_license_link_id" text;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_licenses_link" ON "customer_licenses" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_license_seat_order" ON "customer_products" USING btree ("customer_license_link_id","created_at","id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_customer_products_customer_license" ON "customer_products" USING btree ("customer_license_link_id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_pool_assignment" ON "customer_products" USING btree ("customer_license_link_id","internal_entity_id") WHERE "customer_products"."customer_license_link_id" IS NOT NULL AND "customer_products"."internal_entity_id" IS NOT NULL AND "customer_products"."status" IN ('active', 'past_due');--> statement-breakpoint
ALTER TABLE "customer_products" DROP COLUMN "customer_license_id";