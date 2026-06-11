CREATE TABLE "usage_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"internal_entity_id" text,
	"feature_id" text NOT NULL,
	"internal_feature_id" text NOT NULL,
	"anchor_customer_entitlement_id" text,
	"window_start_at" numeric NOT NULL,
	"window_end_at" numeric NOT NULL,
	"usage" numeric DEFAULT 0 NOT NULL,
	"updated_at" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "usage_limits" jsonb;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "usage_limits" jsonb;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_internal_feature_id_fkey" FOREIGN KEY ("internal_feature_id") REFERENCES "public"."features"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_anchor_customer_entitlement_id_fkey" FOREIGN KEY ("anchor_customer_entitlement_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "idx_usage_windows_internal_customer_id" ON "usage_windows" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "idx_usage_windows_customer_feature_scope" ON "usage_windows" USING btree ("internal_customer_id","internal_feature_id",COALESCE("internal_entity_id", ''));
