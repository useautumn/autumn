import { expect, test } from "bun:test";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";

test(
	"balance worker routing is enabled by default only in development",
	usesDevelopmentRollout,
);
test(
	"production cannot opt into the development balance worker route",
	rejectsProductionRollout,
);
test(
	"development uses the shared worker topic and partition configuration",
	readsBalanceWorkerEnvironment,
);

function usesDevelopmentRollout() {
	expect(createBalanceWorkerClientEnv({}).BALANCE_WORKER_ROLLOUT_ENABLED).toBe(
		false,
	);
	expect(
		createBalanceWorkerClientEnv({ NODE_ENV: "development" })
			.BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(true);
	expect(
		createBalanceWorkerClientEnv({
			NODE_ENV: "development",
			BALANCE_WORKER_ROLLOUT_ENABLED: "false",
		}).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(true);
}

function rejectsProductionRollout() {
	expect(
		createBalanceWorkerClientEnv({
			NODE_ENV: "production",
			BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		}).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
	expect(
		createBalanceWorkerClientEnv({ BALANCE_WORKER_ROLLOUT_ENABLED: "true" })
			.BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
}

function readsBalanceWorkerEnvironment() {
	const env = createBalanceWorkerClientEnv({
		NODE_ENV: "development",
		BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "test-ownership",
		BALANCE_WORKER_PARTITION_COUNT: "4",
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: "2500",
	});
	expect(env).toEqual({
		BALANCE_WORKER_ROLLOUT_ENABLED: true,
		KAFKA_BROKERS: ["127.0.0.1:19092", "localhost:29092"],
		BALANCE_WORKER_OWNERSHIP_TOPIC: "test-ownership",
		BALANCE_WORKER_PARTITION_COUNT: 4,
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: 2500,
	});
}
