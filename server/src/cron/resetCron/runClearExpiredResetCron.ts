import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { CronContext } from "../utils/CronContext.js";

const BATCH_SIZE = 5000;
const TICK_MS = 30_000;
const RUN_BUDGET_MS = 55_000;

// Grace window: don't mark products that expired recently (they may still be
// reactivated/refunded/resubscribed). updated_at is stamped on every status
// change; ended_at is unreliable (not set on manual expiry).
const EXPIRED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Backfill: mark entitlements of expired (terminal) products as expired so the
// reset cron can skip them. Only flips NULL -> true; a manual `false` stays
// sticky. Self-terminating once drained; remove this job after it idles.
const clearExpiredBatch = async ({ ctx }: { ctx: CronContext }) => {
	const { db } = ctx;
	const graceBefore = Date.now() - EXPIRED_GRACE_MS;
	const updated = await db.execute<{ id: string }>(sql`
		WITH batch AS (
			SELECT ce.id
			FROM customer_entitlements ce
			JOIN customer_products cp ON ce.customer_product_id = cp.id
			WHERE ce.expired IS NULL
				AND ce.next_reset_at IS NOT NULL
				AND cp.status = ${CusProductStatus.Expired}
				AND (cp.updated_at IS NULL OR cp.updated_at < ${graceBefore})
			LIMIT ${BATCH_SIZE}
			FOR UPDATE OF ce SKIP LOCKED
		)
		UPDATE customer_entitlements ce
		SET expired = true
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
		logger.info(`clearExpiredReset: marked ${count} (run total ${total})`);

		// Drained: fewer than a full batch means no more unmarked rows.
		if (count < BATCH_SIZE) break;
		if (Date.now() - startTime + TICK_MS >= RUN_BUDGET_MS) break;
		await sleep(TICK_MS);
	}
};
