CREATE TABLE "invoice_templates" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text,
	"org_id" text NOT NULL,
	"created_at" numeric,
	"name" text NOT NULL,
	"footer" text,
	"memo" text,
	"net_terms_days" integer,
	CONSTRAINT "invoice_templates_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;