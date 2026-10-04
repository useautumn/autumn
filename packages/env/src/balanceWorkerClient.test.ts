import { expect, test } from "bun:test";
import {
	createBalanceWorkerClientEnv,
	createBalanceWorkerTransportEnv,
} from "./balanceWorkerClient.js";

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
		BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC: "local-catalog-invalidations",
		BALANCE_WORKER_PARTITION_COUNT: 4,
		BALANCE_WORKER_CHECK_LEASES: false,
		BALANCE_WORKER_SHARED_CHECK_LEASES: false,
	});
});

test.concurrent("check leases are off unless switched on, as in prod", () => {
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_CHECK_LEASES: "true",
		}).BALANCE_WORKER_CHECK_LEASES,
	).toBe(true);
	expect(() =>
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_CHECK_LEASES: "off",
		}),
	).toThrow("BALANCE_WORKER_CHECK_LEASES must be true or false");
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_CHECK_LEASES: "true",
			BALANCE_WORKER_SHARED_CHECK_LEASES: "true",
		}),
	).toMatchObject({
		BALANCE_WORKER_CHECK_LEASES: true,
		BALANCE_WORKER_SHARED_CHECK_LEASES: true,
	});
	expect(
		createBalanceWorkerClientEnv({
			...localEnv,
			BALANCE_WORKER_CHECK_LEASES: "",
			BALANCE_WORKER_SHARED_CHECK_LEASES: "false",
		}),
	).toMatchObject({
		BALANCE_WORKER_CHECK_LEASES: false,
		BALANCE_WORKER_SHARED_CHECK_LEASES: false,
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

test.concurrent("MSK is reached directly only from inside ECS", () => {
	expect(
		createBalanceWorkerTransportEnv({ NODE_ENV: "production" })
			.BALANCE_WORKER_TRANSPORT,
	).toBe("proxy");
	expect(
		createBalanceWorkerTransportEnv({
			ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/task",
		}).BALANCE_WORKER_TRANSPORT,
	).toBe("direct");
	expect(
		createBalanceWorkerTransportEnv(localEnv).BALANCE_WORKER_TRANSPORT,
	).toBe("direct");
	expect(
		createBalanceWorkerTransportEnv({
			...localEnv,
			BALANCE_WORKER_TRANSPORT: "proxy",
		}).BALANCE_WORKER_TRANSPORT,
	).toBe("proxy");
});

test.concurrent("the proxy secret must be long enough to sign with", () => {
	expect(() =>
		createBalanceWorkerTransportEnv({ BALANCE_WORKER_PROXY_SECRET: "short" }),
	).toThrow("BALANCE_WORKER_PROXY_SECRET must be at least 32 characters");
});
