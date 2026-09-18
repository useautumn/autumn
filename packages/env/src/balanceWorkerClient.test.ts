import { expect, test } from "bun:test";
import {
	createBalanceWorkerClientEnv,
	parseBalanceWorkerRolloutEnabled,
} from "./balanceWorkerClient.js";

const localEnv = { KAFKA_AUTH_MODE: "none" };

test.concurrent(
	"disabled rollout ignores missing or invalid Kafka settings",
	() => {
		for (const kafkaEnv of [
			{},
			{ KAFKA_AUTH_MODE: "invalid" },
			{ AWS_REGION: "us-east-1", BALANCE_WORKER_PARTITION_COUNT: "16" },
		]) {
			for (const rollout of [undefined, "false"]) {
				expect(
					parseBalanceWorkerRolloutEnabled({
						runtimeEnv: {
							NODE_ENV: "production",
							...kafkaEnv,
							BALANCE_WORKER_ROLLOUT_ENABLED: rollout,
						},
					}),
				).toBe(false);
			}
		}
	},
);

test.concurrent(
	"the isolated flag parser routes on the flag alone",
	() => {
		for (const nodeEnv of [undefined, "development", "test", "production"]) {
			expect(
				parseBalanceWorkerRolloutEnabled({
					runtimeEnv: {
						NODE_ENV: nodeEnv,
						BALANCE_WORKER_ROLLOUT_ENABLED: "true",
					},
				}),
			).toBe(true);
		}
		expect(() =>
			parseBalanceWorkerRolloutEnabled({
				runtimeEnv: { BALANCE_WORKER_ROLLOUT_ENABLED: "yes" },
			}),
		).toThrow("must be true or false");
	},
);

test.concurrent(
	"actual client configuration still validates Kafka with direct routing off",
	() => {
		expect(() =>
			createBalanceWorkerClientEnv({ NODE_ENV: "production" }),
		).toThrow("KAFKA_AUTH_MODE=msk_iam requires AWS_REGION");
		expect(() =>
			createBalanceWorkerClientEnv({
				NODE_ENV: "production",
				BALANCE_WORKER_ROLLOUT_ENABLED: "false",
				KAFKA_AUTH_MODE: "invalid",
			}),
		).toThrow("KAFKA_AUTH_MODE must be none or msk_iam");
	},
);

test(
	"balance worker routing requires an explicit development opt-in",
	usesDevelopmentRollout,
);
test(
	"any environment may opt into the balance worker route",
	acceptsRolloutInAnyEnvironment,
);
test(
	"development uses the shared worker topic and partition configuration",
	readsBalanceWorkerEnvironment,
);
test("client uses 512 partitions without an environment setting", () => {
	expect(
		createBalanceWorkerClientEnv(localEnv).BALANCE_WORKER_PARTITION_COUNT,
	).toBe(512);
});
test.each(["4", "8", "16", "0", "not-a-number"])(
	"client rejects a partition count that differs from the fixed layout: %s",
	(partitionCount) => {
		expect(() =>
			createBalanceWorkerClientEnv({
				...localEnv,
				BALANCE_WORKER_PARTITION_COUNT: partitionCount,
			}),
		).toThrow("BALANCE_WORKER_PARTITION_COUNT is fixed at 512");
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

function acceptsRolloutInAnyEnvironment() {
	for (const nodeEnv of ["production", undefined]) {
		expect(
			createBalanceWorkerClientEnv({
				...localEnv,
				NODE_ENV: nodeEnv,
				BALANCE_WORKER_ROLLOUT_ENABLED: "true",
			}).BALANCE_WORKER_ROLLOUT_ENABLED,
		).toBe(true);
	}
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
		BALANCE_WORKER_PARTITION_COUNT: "512",
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: "2500",
	});
	expect(env).toEqual({
		KAFKA_AUTH_MODE: "none",
		AWS_REGION: undefined,
		BALANCE_WORKER_ROLLOUT_ENABLED: true,
		KAFKA_BROKERS: ["127.0.0.1:19092", "localhost:29092"],
		BALANCE_WORKER_OWNERSHIP_TOPIC: "test-ownership",
		BALANCE_WORKER_PARTITION_COUNT: 512,
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: 2500,
	});
}
