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
	test("routes over the deployment's configured partition count", () => {
		expect(
			createBalanceWorkerEnv({
				...valid,
				BALANCE_WORKER_PARTITION_COUNT: "128",
			}).BALANCE_WORKER_PARTITION_COUNT,
		).toBe(128);
	});
	test("sizes the subject map from a tenth of the container's memory unless a deployment fixes the budget", () => {
		const env = createBalanceWorkerEnv(valid);
		expect(env.BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION).toBe(0.25);
		expect(env.BALANCE_WORKER_SUBJECT_MAP_BUDGET_BYTES).toBeUndefined();
		const fixed = createBalanceWorkerEnv({
			...valid,
			BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION: "0.4",
			BALANCE_WORKER_SUBJECT_MAP_BUDGET_BYTES: "1073741824",
		});
		expect(fixed.BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION).toBe(0.4);
		expect(fixed.BALANCE_WORKER_SUBJECT_MAP_BUDGET_BYTES).toBe(1_073_741_824);
		expect(() =>
			createBalanceWorkerEnv({
				...valid,
				BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION: "0.75",
			}),
		).toThrow();
	});
	test("samples successful request logs at one in twenty unless a deployment says otherwise", () => {
		expect(
			createBalanceWorkerEnv(valid).BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE,
		).toBe(0.05);
		expect(
			createBalanceWorkerEnv({
				...valid,
				BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE: "1",
			}).BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE,
		).toBe(1);
		expect(() =>
			createBalanceWorkerEnv({
				...valid,
				BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE: "1.5",
			}),
		).toThrow();
	});
	test("commits transactionally unless a deployment opts into the one-trip commit", () => {
		expect(createBalanceWorkerEnv(valid).BALANCE_WORKER_COMMIT_MODE).toBe(
			"transactional",
		);
		expect(
			createBalanceWorkerEnv({
				...valid,
				BALANCE_WORKER_COMMIT_MODE: "idempotent",
			}).BALANCE_WORKER_COMMIT_MODE,
		).toBe("idempotent");
		expect(() =>
			createBalanceWorkerEnv({ ...valid, BALANCE_WORKER_COMMIT_MODE: "fast" }),
		).toThrow();
	});

	test("derives every Kafka name from the deployment", () => {
		const env = createBalanceWorkerEnv({
			...valid,
			BALANCE_WORKER_DEPLOYMENT: "tf-balance-staging-v2-64",
			BALANCE_WORKER_METERING_TOPIC: "ignored",
		});
		expect(env.BALANCE_WORKER_METERING_TOPIC).toBe(
			"tf-balance-staging-v2-64-events",
		);
		expect(env.BALANCE_WORKER_OWNERSHIP_TOPIC).toBe(
			"tf-balance-staging-v2-64-ownership",
		);
		expect(env.BALANCE_WORKER_GROUP_ID).toBe(
			"tf-balance-staging-v2-64-workers",
		);
	});
	test("the group id is the deployment's base name; a fleet suffix is the worker's to add once it knows its ECS service", () => {
		const env = createBalanceWorkerEnv({
			...valid,
			BALANCE_WORKER_DEPLOYMENT: "tf-balance-staging-v2-64",
			BALANCE_WORKER_SLOT: "green",
		});
		expect(env.BALANCE_WORKER_GROUP_ID).toBe(
			"tf-balance-staging-v2-64-workers",
		);
		expect(env).not.toHaveProperty("BALANCE_WORKER_SLOT");
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
