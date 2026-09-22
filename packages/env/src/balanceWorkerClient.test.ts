import { expect, test } from "bun:test";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";

const localEnv = { KAFKA_AUTH_MODE: "none" };

test.concurrent("client configuration validates Kafka auth", () => {
	expect(() =>
		createBalanceWorkerClientEnv({
			NODE_ENV: "production",
			KAFKA_BROKERS: "broker:9098",
			BALANCE_WORKER_DEPLOYMENT: "staging",
		}),
	).toThrow("KAFKA_AUTH_MODE=msk_iam requires AWS_REGION");
	expect(() =>
		createBalanceWorkerClientEnv({ KAFKA_AUTH_MODE: "invalid" }),
	).toThrow("KAFKA_AUTH_MODE must be none or msk_iam");
});

test.concurrent("production refuses to fall back to local settings", () => {
	expect(() =>
		createBalanceWorkerClientEnv({
			...localEnv,
			NODE_ENV: "production",
			BALANCE_WORKER_DEPLOYMENT: "staging",
		}),
	).toThrow("KAFKA_BROKERS is required in production");
	expect(() =>
		createBalanceWorkerClientEnv({
			...localEnv,
			NODE_ENV: "production",
			KAFKA_BROKERS: "broker:9098",
		}),
	).toThrow("BALANCE_WORKER_DEPLOYMENT is required in production");
});

test.concurrent("local development needs no balance worker settings", () => {
	expect(createBalanceWorkerClientEnv(localEnv)).toEqual({
		KAFKA_AUTH_MODE: "none",
		AWS_REGION: undefined,
		KAFKA_BROKERS: ["127.0.0.1:19092"],
		BALANCE_WORKER_OWNERSHIP_TOPIC: "local-ownership",
		BALANCE_WORKER_COMMAND_TOPIC: "local-commands",
	});
});

test.concurrent("the ownership topic derives from the deployment", () => {
	const env = createBalanceWorkerClientEnv({
		...localEnv,
		KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		BALANCE_WORKER_DEPLOYMENT: "tf-balance-staging-v2-512",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "ignored",
	});
	expect(env.KAFKA_BROKERS).toEqual(["127.0.0.1:19092", "localhost:29092"]);
	expect(env.BALANCE_WORKER_OWNERSHIP_TOPIC).toBe(
		"tf-balance-staging-v2-512-ownership",
	);
});
