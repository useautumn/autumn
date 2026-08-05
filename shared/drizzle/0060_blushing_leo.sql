CREATE TABLE "customer_lsns" (
	"org_id" text NOT NULL,
	"env" text NOT NULL,
	"customer_id" text NOT NULL,
	"internal_customer_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_lsns_pkey" PRIMARY KEY("org_id","env","customer_id")
);
--> statement-breakpoint
ALTER TABLE "customer_lsns" ENABLE ROW LEVEL SECURITY;