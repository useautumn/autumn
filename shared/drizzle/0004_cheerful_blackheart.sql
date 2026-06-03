CREATE TABLE "invoice_templates" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text,
	"org_id" text,
	"env" text,
	"created_at" numeric,
	"name" text,
	"footer" text
);
--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;