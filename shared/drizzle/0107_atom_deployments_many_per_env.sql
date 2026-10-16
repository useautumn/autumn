DROP INDEX "atom_deployments_active_org_id_env_key";--> statement-breakpoint
ALTER TABLE "atom_deployments" ADD COLUMN "name" text;--> statement-breakpoint
CREATE INDEX "atom_deployments_org_id_env_idx" ON "atom_deployments" USING btree ("org_id","env");