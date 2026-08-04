-- Pooled balances now reset through the lazy/cron paths regardless of
-- reset_mode; un-stamp synthetic pool cusEnts so the batch-reset scan and its
-- partial index see them again.
UPDATE "customer_entitlements"
SET "reset_by_invoice" = false
WHERE "is_pooled_balance" = true
	AND "reset_by_invoice" IS TRUE;
