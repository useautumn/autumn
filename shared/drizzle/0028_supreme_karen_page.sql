-- ALTER TABLE "customer_products" DROP COLUMN "auto_topups";--> statement-breakpoint
-- ALTER TABLE "customer_products" DROP COLUMN "spend_limits";--> statement-breakpoint
-- ALTER TABLE "customer_products" DROP COLUMN "usage_limits";--> statement-breakpoint
-- ALTER TABLE "customer_products" DROP COLUMN "usage_alerts";--> statement-breakpoint
-- ALTER TABLE "customer_products" DROP COLUMN "overage_allowed";--> statement-breakpoint


ALTER TABLE "chat_oauth_credentials" DROP CONSTRAINT "chat_oauth_credentials_installation_org_env_key";--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" ADD COLUMN "refresh_token_expires_at" numeric;--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ADD COLUMN "id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" DROP CONSTRAINT "cma_vaults_chat_installation_id_org_id_env_pk";--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ADD CONSTRAINT "cma_vaults_pkey" PRIMARY KEY("id");--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "chat_oauth_credentials" ADD CONSTRAINT "chat_oauth_credentials_installation_org_env_user_key" UNIQUE("chat_installation_id","org_id","env","user_id");--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ADD CONSTRAINT "cma_vaults_installation_org_env_user_key" UNIQUE("chat_installation_id","org_id","env","user_id");
