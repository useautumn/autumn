-- Reprice history from Modal Function rates to Sandbox rates x 1.75 (every twd run so far was pinned to us-east-1).
UPDATE "runs" SET "cost_usd" = "cost_usd" * ((2 * 0.00003942 + 4 * 0.00000667) / (2 * 0.0000131 + 4 * 0.00000222)) * 1.75;--> statement-breakpoint
UPDATE "warm_images" SET "cost_usd" = "cost_usd" * ((2 * 0.00003942 + 4 * 0.00000667) / (2 * 0.0000131 + 4 * 0.00000222)) * 1.75 WHERE "cost_usd" IS NOT NULL;
