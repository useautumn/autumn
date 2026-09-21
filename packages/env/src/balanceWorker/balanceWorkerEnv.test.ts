import { describe, expect, test } from "bun:test";
import { createAutumnEnv } from "../index.js";
import { createBalanceWorkerEnv } from "./balanceWorkerEnv.js";

const valid = {
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
	KAFKA_BROKERS: "127.0.0.1:19092",
	KAFKA_AUTH_MODE: "none",
};
describe("Balance worker environment", () => {
	test("parses isolated local defaults and broker lists", () => {
		const env = createBalanceWorkerEnv({
			...valid,
			DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
			KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		});
		expect(env.KAFKA_BROKERS).toEqual(["127.0.0.1:19092", "localhost:29092"]);
		expect(env.BALANCE_WORKER_HOST).toBe("127.0.0.1");
		expect(env.BALANCE_WORKER_PORT).toBe(8082);
		expect(env.BALANCE_WORKER_ENDPOINT).toBe("http://127.0.0.1:8082");
		expect(env.BALANCE_WORKER_PARTITION_COUNT).toBe(4);
	});
	test("derives every Kafka name from the deployment", () => {
		const env = createBalanceWorkerEnv({
			...valid,
			BALANCE_WORKER_DEPLOYMENT: "tf-balance-staging-v2-512",
			BALANCE_WORKER_METERING_TOPIC: "ignored",
		});
		expect(env.BALANCE_WORKER_METERING_TOPIC).toBe(
			"tf-balance-staging-v2-512-events",
		);
		expect(env.BALANCE_WORKER_OWNERSHIP_TOPIC).toBe(
			"tf-balance-staging-v2-512-ownership",
		);
		expect(env.BALANCE_WORKER_GROUP_ID).toBe(
			"tf-balance-staging-v2-512-workers",
		);
	});
	test("production requires a deployment", () => {
		expect(() =>
			createBalanceWorkerEnv({ ...valid, NODE_ENV: "production" }),
		).toThrow("BALANCE_WORKER_DEPLOYMENT is required in production");
	});
	test("reads the database URL under the name deployed workers still receive", () => {
		expect(
			createBalanceWorkerEnv({
				KAFKA_BROKERS: valid.KAFKA_BROKERS,
				KAFKA_AUTH_MODE: "none",
				BALANCE_WORKER_DATABASE_URL: valid.DATABASE_URL,
			}).DATABASE_URL,
		).toBe(valid.DATABASE_URL);
	});
	test("derives advertised endpoint from configured port", () => {
		expect(
			createBalanceWorkerEnv({ ...valid, BALANCE_WORKER_PORT: "12982" })
				.BALANCE_WORKER_ENDPOINT,
		).toBe("http://127.0.0.1:12982");
	});
	test.each<Record<string, string | undefined>>([
		{},
		{
			DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
			KAFKA_BROKERS: "",
		},
		{
			DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
			KAFKA_BROKERS: "a:9092,",
		},
		{
			DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
			KAFKA_BROKERS: "https://broker:9092",
		},
		{ ...valid, BALANCE_WORKER_PORT: "0" },
		{ ...valid, BALANCE_WORKER_PORT: "65536" },
		{ ...valid, BALANCE_WORKER_PORT: "1.5" },
		{ ...valid, BALANCE_WORKER_HOST: "0.0.0.0" },
		{ ...valid, BALANCE_WORKER_ENDPOINT: "http://[::1]:8082" },
		{ ...valid, BALANCE_WORKER_ENDPOINT: "https://public.example.com" },
		{ ...valid, BALANCE_WORKER_SQLITE_PATH: " " },
		{ ...valid, BALANCE_WORKER_DEPLOYMENT: "not a topic name" },
	])("rejects invalid or unsafe settings %j", (input) => {
		expect(() => createBalanceWorkerEnv(input)).toThrow();
	});
	test("does not add worker requirements to the root environment", () => {
		expect(
			createAutumnEnv({ AUTUMN_API_URL: "http://localhost:8080" })
				.AUTUMN_API_URL,
		).toBe("http://localhost:8080");
	});
});
