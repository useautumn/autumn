ALTER TABLE "products" ADD COLUMN "version_slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products" SET "version_slug" = 'v' || "version"::int;--> statement-breakpoint
UPDATE "products" p SET "active" = true
WHERE p."version" = (
	SELECT max(p2."version") FROM "products" p2
	WHERE p2."org_id" = p."org_id" AND p2."id" = p."id" AND p2."env" = p."env"
);--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_product_version_slug" ON "products" USING btree ("org_id","id","env","version_slug") WHERE "products"."version_slug" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "unique_active_product" ON "products" USING btree ("org_id","id","env") WHERE "products"."active" = true;