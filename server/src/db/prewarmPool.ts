import type { Pool, PoolClient } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";

/** PgBouncer establishes backends one at a time, so opening every connection at
 *  once just moves the queue rather than removing it. */
const PREWARM_BATCH_SIZE = 5;
const PREWARM_MAX_JITTER_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** pg-pool's `min` only exempts idle connections from reaping — it never opens
 *  any, so without this every process starts empty and races under first load. */
export const prewarmPool = async ({
	pool,
	name,
	target,
}: {
	pool: Pool;
	name: string;
	target: number;
}): Promise<void> => {
	if (target <= 0) return;

	// Every task boots at once during a deploy; spread the handshakes out.
	await sleep(Math.random() * PREWARM_MAX_JITTER_MS);

	const startedAt = Date.now();
	const clients: PoolClient[] = [];
	let failed = 0;

	for (let i = 0; i < target; i += PREWARM_BATCH_SIZE) {
		const batchSize = Math.min(PREWARM_BATCH_SIZE, target - i);
		const results = await Promise.allSettled(
			Array.from({ length: batchSize }, () => pool.connect()),
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				clients.push(result.value);
			} else {
				failed++;
			}
		}
	}

	// Released only once all are open: releasing as we go lets pg-pool hand the
	// same connection back, so no additional ones would ever be established.
	for (const client of clients) {
		client.release();
	}

	logger.info("[PrewarmPool] Warmed", {
		type: "pg_pool_prewarm",
		pool: name,
		pid: process.pid,
		target,
		warmed: clients.length,
		failed,
		durationMs: Date.now() - startedAt,
	});
};
