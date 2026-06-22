ALTER TABLE "leaf"."cma_vaults" ADD COLUMN "chat_installation_id" text;--> statement-breakpoint
UPDATE "leaf"."cma_vaults" SET "chat_installation_id" = 'legacy' WHERE "chat_installation_id" IS NULL;--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ALTER COLUMN "chat_installation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" DROP CONSTRAINT IF EXISTS "cma_vaults_org_id_env_pk";--> statement-breakpoint
ALTER TABLE "leaf"."cma_vaults" ADD CONSTRAINT "cma_vaults_chat_installation_id_org_id_env_pk" PRIMARY KEY("chat_installation_id","org_id","env");
