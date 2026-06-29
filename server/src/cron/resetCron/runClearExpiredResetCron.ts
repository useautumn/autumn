import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { CronContext } from "../utils/CronContext.js";

const BATCH_SIZE = 5000;
const TICK_MS = 30_000;
const RUN_BUDGET_MS = 55_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Backfill: clear next_reset_at on entitlements of expired (terminal) products
// so the reset cron stops scanning ~12M stale rows. Self-terminating once the
// backlog drains; remove this job after it idles. See forward fix at expiry sites.
const clearExpiredBatch = async ({ ctx }: { ctx: CronContext }) => {
	const { db } = ctx;
	const updated = await db.execute<{ id: string }>(sql`
		WITH batch AS (
			SELECT ce.id
			FROM customer_entitlements ce
			JOIN customer_products cp ON ce.customer_product_id = cp.id
			WHERE ce.next_reset_at IS NOT NULL
				AND cp.status = ${CusProductStatus.Expired}
			LIMIT ${BATCH_SIZE}
			FOR UPDATE OF ce SKIP LOCKED
		)
		UPDATE customer_entitlements ce
		SET next_reset_at = NULL
		FROM batch
		WHERE ce.id = batch.id
		RETURNING ce.id
	`);
	return updated.length;
};

export const runClearExpiredResetCron = async ({ ctx }: { ctx: CronContext }) => {
	const { logger } = ctx;

	if (process.env.DISABLE_CLEAR_EXPIRED_RESET_CRON === "true") return;

	const startTime = Date.now();
	let total = 0;

	while (Date.now() - startTime < RUN_BUDGET_MS) {
		let count: number;
		try {
			count = await clearExpiredBatch({ ctx });
		} catch (error) {
			logger.error(`clearExpiredReset: batch failed ${error}`);
			return;
		}

		total += count;
		logger.info(`clearExpiredReset: nulled ${count} (run total ${total})`);

		// Drained: fewer than a full batch means no more stale rows.
		if (count < BATCH_SIZE) break;
		if (Date.now() - startTime + TICK_MS >= RUN_BUDGET_MS) break;
		await sleep(TICK_MS);
	}
};
