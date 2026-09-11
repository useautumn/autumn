import { expect, test } from "bun:test";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";

const localEnv = { KAFKA_AUTH_MODE: "none" };

test(
	"balance worker routing requires an explicit development opt-in",
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
test("client uses eight staging partitions without an environment setting", () => {
	expect(
		createBalanceWorkerClientEnv(localEnv).BALANCE_WORKER_PARTITION_COUNT,
	).toBe(8);
});
test.each(["4", "16", "0", "not-a-number"])(
	"client rejects a partition count that differs from the staging constant: %s",
	(partitionCount) => {
		expect(() =>
			createBalanceWorkerClientEnv({
				...localEnv,
				BALANCE_WORKER_PARTITION_COUNT: partitionCount,
			}),
		).toThrow("BALANCE_WORKER_PARTITION_COUNT is fixed at 8 for staging");
	},
);

function usesDevelopmentRollout() {
	expect(
		createBalanceWorkerClientEnv(localEnv).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
	expect(
		createBalanceWorkerClientEnv({ ...localEnv, NODE_ENV: "development" })
			.BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			NODE_ENV: "development",
			BALANCE_WORKER_ROLLOUT_ENABLED: "false",
		}).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(false);
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			NODE_ENV: "development",
			BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		}).BALANCE_WORKER_ROLLOUT_ENABLED,
	).toBe(true);
}

function rejectsProductionRollout() {
	expect(() =>
		createBalanceWorkerClientEnv({
			NODE_ENV: "production",
			BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		}),
	).toThrow("requires NODE_ENV=development");
	expect(() =>
		createBalanceWorkerClientEnv({ BALANCE_WORKER_ROLLOUT_ENABLED: "true" }),
	).toThrow("requires NODE_ENV=development");
	expect(() =>
		createBalanceWorkerClientEnv({
			NODE_ENV: "development",
			BALANCE_WORKER_ROLLOUT_ENABLED: "yes",
		}),
	).toThrow("must be true or false");
}

function readsBalanceWorkerEnvironment() {
	const env = createBalanceWorkerClientEnv({
		...localEnv,
		NODE_ENV: "development",
		BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "test-ownership",
		BALANCE_WORKER_PARTITION_COUNT: "8",
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: "2500",
	});
	expect(env).toEqual({
		KAFKA_AUTH_MODE: "none",
		AWS_REGION: undefined,
		BALANCE_WORKER_ROLLOUT_ENABLED: true,
		KAFKA_BROKERS: ["127.0.0.1:19092", "localhost:29092"],
		BALANCE_WORKER_OWNERSHIP_TOPIC: "test-ownership",
		BALANCE_WORKER_PARTITION_COUNT: 8,
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: 2500,
	});
}
