import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	balanceWorkerEnvToRuntimeConfig,
	PRODUCER_RETRY_BUDGET_MS,
} from "../../../src/init/workerConfig.js";

test("partition producers retry within milliseconds and keep retrying through a leader election", () => {
	const env = createBalanceWorkerEnv({
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		KAFKA_BROKERS: "127.0.0.1:19092",
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_PORT: "12982",
	});
	const { producerLimits } = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: "http://127.0.0.1:12982",
		groupId: env.BALANCE_WORKER_GROUP_ID,
	});

	// CONCURRENT_TRANSACTIONS clears in a few ms; a 100ms first backoff was the tail.
	expect(producerLimits.initialRetryTimeMs).toBeLessThanOrEqual(10);

	// kafkajs doubles each wait up to maxRetryTimeMs: 10 + 20 + … + 1280 + 2500 + 2500 ms.
	let totalBackoffMs = 0;
	for (let attempt = 0; attempt < producerLimits.retryCount; attempt++) {
		totalBackoffMs += Math.min(
			producerLimits.initialRetryTimeMs * 2 ** attempt,
			producerLimits.maxRetryTimeMs,
		);
	}
	expect(totalBackoffMs).toBe(7_550);
	expect(totalBackoffMs).toBeGreaterThanOrEqual(PRODUCER_RETRY_BUDGET_MS);
});
