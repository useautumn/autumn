SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "competes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balance_contributions" ADD COLUMN "unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pooled_balances" ADD COLUMN "feature_override_signature" text DEFAULT 'none' NOT NULL;
