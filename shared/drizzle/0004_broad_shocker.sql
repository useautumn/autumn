CREATE TABLE "replaceables" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"cus_ent_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"from_entity_id" text,
	"delete_next_cycle" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "replaceables" ADD CONSTRAINT "replaceables_cus_ent_id_fkey" FOREIGN KEY ("cus_ent_id") REFERENCES "public"."customer_entitlements"("id") ON DELETE cascade ON UPDATE no action;