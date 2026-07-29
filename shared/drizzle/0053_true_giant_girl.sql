CREATE TABLE "sso_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pending_domain_verification' NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sso_connection_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "sso_connection_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "sso_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"domain" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
ALTER TABLE "sso_provider" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_connection" ADD CONSTRAINT "sso_connection_provider_id_sso_provider_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."sso_provider"("provider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_connection" ADD CONSTRAINT "sso_connection_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX CONCURRENTLY "sso_connection_organization_id_idx" ON "sso_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "sso_provider_user_id_idx" ON "sso_provider" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "sso_provider_organization_id_idx" ON "sso_provider" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "sso_provider_domain_idx" ON "sso_provider" USING btree ("domain");