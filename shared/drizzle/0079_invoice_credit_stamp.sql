ALTER TABLE "customer_entitlements" ADD COLUMN IF NOT EXISTS "invoice_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "customer_entitlements" ce
SET "invoice_credit" = true
FROM "features" f
WHERE f."internal_id" = ce."internal_feature_id"
  AND f."type" = 'credit_system'
  AND (f."config"->>'invoice_credit') = 'true';
