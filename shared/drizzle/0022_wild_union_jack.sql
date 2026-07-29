CREATE TABLE "customer_jwt_families" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"internal_customer_id" text NOT NULL,
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"refresh_kid" integer DEFAULT 0 NOT NULL,
	"indefinite" boolean DEFAULT false NOT NULL,
	"created_at" numeric NOT NULL,
	"updated_at" numeric NOT NULL,
	CONSTRAINT "customer_jwt_families_internal_customer_id_key" UNIQUE("internal_customer_id")
);
--> statement-breakpoint
ALTER TABLE "customer_jwt_families" ADD CONSTRAINT "customer_jwt_families_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;