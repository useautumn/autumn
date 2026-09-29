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
		BALANCE_WORKER_TRANSPORT: "direct",
		BALANCE_WORKER_PROXY_SECRET: null,
		KAFKA_BROKERS: ["127.0.0.1:19092"],
		BALANCE_WORKER_OWNERSHIP_TOPIC: "local-ownership",
		BALANCE_WORKER_COMMAND_TOPIC: "local-commands",
		BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC: "local-catalog-invalidations",
		BALANCE_WORKER_PARTITION_COUNT: 4,
	});
});

test.concurrent("the ownership topic derives from the deployment", () => {
	const env = createBalanceWorkerClientEnv({
		...localEnv,
		KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		BALANCE_WORKER_DEPLOYMENT: "tf-balance-staging-v2-64",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "ignored",
	});
	expect(env.KAFKA_BROKERS).toEqual(["127.0.0.1:19092", "localhost:29092"]);
	expect(env.BALANCE_WORKER_OWNERSHIP_TOPIC).toBe(
		"tf-balance-staging-v2-64-ownership",
	);
});

const mskEnv = { KAFKA_AUTH_MODE: "msk_iam", AWS_REGION: "us-east-2" };

test.concurrent("MSK is reached directly only from inside ECS", () => {
	expect(createBalanceWorkerClientEnv(mskEnv).BALANCE_WORKER_TRANSPORT).toBe(
		"proxy",
	);
	expect(
		createBalanceWorkerClientEnv({
			...mskEnv,
			ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/task",
		}).BALANCE_WORKER_TRANSPORT,
	).toBe("direct");
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_TRANSPORT: "proxy",
		}).BALANCE_WORKER_TRANSPORT,
	).toBe("proxy");
});

test.concurrent("the proxy secret must be long enough to sign with", () => {
	expect(() =>
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_PROXY_SECRET: "short",
		}),
	).toThrow("BALANCE_WORKER_PROXY_SECRET must be at least 32 characters");
});
