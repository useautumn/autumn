import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker.js";
import { createAutumnEnv } from "./index.js";

const valid = { KAFKA_BROKERS: "127.0.0.1:19092", KAFKA_AUTH_MODE: "none" };
describe("Balance worker environment", () => {
	test("parses isolated local defaults and broker lists", () => {
		const env = createBalanceWorkerEnv({
			...valid,
			KAFKA_BROKERS: "127.0.0.1:19092, localhost:29092",
		});
		expect(env.KAFKA_BROKERS).toEqual(["127.0.0.1:19092", "localhost:29092"]);
		expect(env.BALANCE_WORKER_HOST).toBe("127.0.0.1");
		expect(env.BALANCE_WORKER_PORT).toBe(8082);
		expect(env.BALANCE_WORKER_ENDPOINT).toBe("http://127.0.0.1:8082");
		expect(env.BALANCE_WORKER_PARTITION_COUNT).toBe(8);
	});
	test("accepts a deployment setting matching the staging constant", () => {
		expect(
			createBalanceWorkerEnv({ ...valid, BALANCE_WORKER_PARTITION_COUNT: "8" })
				.BALANCE_WORKER_PARTITION_COUNT,
		).toBe(8);
	});
	test.each(["4", "16", "0", "not-a-number"])(
		"rejects a partition count that differs from the staging constant: %s",
		(partitionCount) => {
			expect(() =>
				createBalanceWorkerEnv({
					...valid,
					BALANCE_WORKER_PARTITION_COUNT: partitionCount,
				}),
			).toThrow("BALANCE_WORKER_PARTITION_COUNT is fixed at 8 for staging");
		},
	);
	test("derives advertised endpoint from configured port", () => {
		expect(
			createBalanceWorkerEnv({ ...valid, BALANCE_WORKER_PORT: "12982" })
				.BALANCE_WORKER_ENDPOINT,
		).toBe("http://127.0.0.1:12982");
	});
	test.each<Record<string, string | undefined>>([
		{},
		{ KAFKA_BROKERS: "" },
		{ KAFKA_BROKERS: "a:9092," },
		{ KAFKA_BROKERS: "https://broker:9092" },
		{ ...valid, BALANCE_WORKER_PORT: "0" },
		{ ...valid, BALANCE_WORKER_PORT: "65536" },
		{ ...valid, BALANCE_WORKER_PORT: "1.5" },
		{ ...valid, BALANCE_WORKER_HOST: "0.0.0.0" },
		{ ...valid, BALANCE_WORKER_ENDPOINT: "http://[::1]:8082" },
		{ ...valid, BALANCE_WORKER_ENDPOINT: "https://public.example.com" },
		{ ...valid, BALANCE_WORKER_PARTITION_COUNT: "0" },
		{ ...valid, BALANCE_WORKER_SQLITE_PATH: " " },
		{ ...valid, BALANCE_WORKER_METERING_TOPIC: ".." },
		{
			...valid,
			BALANCE_WORKER_METERING_TOPIC: "owners",
			BALANCE_WORKER_OWNERSHIP_TOPIC: "owners",
		},
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
