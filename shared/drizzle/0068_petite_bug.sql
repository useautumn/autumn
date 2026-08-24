CREATE TABLE "product_aliases" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"alias_id" text NOT NULL,
	"canonical_plan_id" text NOT NULL,
	"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
	CONSTRAINT "product_aliases_pkey" PRIMARY KEY("org_id","env","alias_id"),
	CONSTRAINT "product_aliases_canonical_unique" UNIQUE("org_id","env","canonical_plan_id")
);
--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;