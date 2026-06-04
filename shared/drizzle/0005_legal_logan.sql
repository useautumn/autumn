CREATE TABLE "usage_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_entitlement_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"window_start_at" numeric NOT NULL,
	"window_end_at" numeric NOT NULL,
	"usage" numeric DEFAULT 0 NOT NULL,
	"updated_at" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_customer_entitlement_id_fkey" FOREIGN KEY ("customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_usage_windows_customer_entitlement_id" ON "usage_windows" USING btree ("customer_entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "idx_usage_windows_cus_ent_feature_window" ON "usage_windows" USING btree ("customer_entitlement_id","feature_id","window_start_at");