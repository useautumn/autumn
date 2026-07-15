DROP INDEX CONCURRENTLY "idx_customer_products_license_parent";--> statement-breakpoint
DROP INDEX CONCURRENTLY "unique_active_license_assignment";--> statement-breakpoint
ALTER TABLE "customer_products" DROP COLUMN "license_parent_customer_product_id";