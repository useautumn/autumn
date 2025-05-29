CREATE TABLE "actions" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"org_id" text NOT NULL,
	"org_slug" text NOT NULL,
	"env" text NOT NULL,
	"customer_id" text,
	"internal_customer_id" text,
	"entity_id" text,
	"internal_entity_id" text,
	"type" text NOT NULL,
	"auth_type" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"properties" jsonb,
	CONSTRAINT "actions_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
