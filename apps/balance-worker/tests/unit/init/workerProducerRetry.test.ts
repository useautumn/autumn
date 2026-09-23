import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { balanceWorkerEnvToRuntimeConfig } from "../../../src/init/workerConfig.js";

test("partition producers retry concurrent transactions within milliseconds", () => {
	const env = createBalanceWorkerEnv({
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		KAFKA_BROKERS: "127.0.0.1:19092",
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_PORT: "12982",
	});
	const { producerLimits } = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: "http://127.0.0.1:12982",
	});

	// CONCURRENT_TRANSACTIONS clears in a few ms; a 100ms first backoff was the tail.
	expect(producerLimits.initialRetryTimeMs).toBeLessThanOrEqual(10);

	// The retries together must still outlast a broker blip of about a second.
	let totalBackoffMs = 0;
	for (let attempt = 0; attempt < producerLimits.retryCount; attempt++) {
		totalBackoffMs += Math.min(
			producerLimits.initialRetryTimeMs * 2 ** attempt,
			producerLimits.maxRetryTimeMs,
		);
	}
	expect(totalBackoffMs).toBeGreaterThanOrEqual(1000);
});
