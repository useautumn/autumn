ALTER TABLE "organizations" ADD COLUMN "claim_state" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "claim_token_hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_organizations_pending_claim_expiry" ON "organizations" USING btree ("claim_expires_at") WHERE "organizations"."claim_state" = 'pending';--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_claim_token_hash_key" UNIQUE("claim_token_hash");