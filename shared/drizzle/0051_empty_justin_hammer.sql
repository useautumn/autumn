ALTER TABLE "auto_topup_limit_states" ADD COLUMN "consecutive_failure_count" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_topup_limit_states" ADD COLUMN "suspended_at" numeric;--> statement-breakpoint
ALTER TABLE "auto_topup_limit_states" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "auto_topup_limit_states" ADD COLUMN "suspended_payment_method_fingerprint" text;