import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker/balanceWorkerEnv.js";
import { createBalanceWorkerClientEnv } from "./balanceWorkerClient.js";
import { createHeraldEnv } from "./herald.js";
import { createKafkaGroupProtocolEnv } from "./kafkaGroupProtocol.js";

const base = {
	KAFKA_BROKERS: "localhost:19092",
	KAFKA_AUTH_MODE: "none",
	DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
};

const services = [
	["worker", createBalanceWorkerEnv],
	["ownership reader", createBalanceWorkerClientEnv],
	["herald", createHeraldEnv],
] as const;

for (const [name, createEnv] of services) {
	describe(`${name} Kafka group protocol`, () => {
		test("speaks the classic protocol outside production unless told otherwise", () => {
			expect(createEnv(base)).toHaveProperty("KAFKA_GROUP_PROTOCOL", "classic");
		});

		test("speaks KIP-848 when told to", () => {
			expect(
				createEnv({ ...base, KAFKA_GROUP_PROTOCOL: "consumer" }),
			).toHaveProperty("KAFKA_GROUP_PROTOCOL", "consumer");
		});

		test("refuses a protocol it does not know", () => {
			expect(() =>
				createEnv({ ...base, KAFKA_GROUP_PROTOCOL: "cooperative" }),
			).toThrow("KAFKA_GROUP_PROTOCOL must be consumer or classic");
		});
	});
}

describe("default Kafka group protocol per environment", () => {
	const production = { NODE_ENV: "production", AWS_REGION: "us-east-2" };
	const staging = {
		NODE_ENV: "production",
		STAGING_ENVIRONMENT: "true",
		AWS_REGION: "us-east-1",
	};

	test.each([
		["production", production, "consumer"],
		[
			"production with a stray staging flag",
			{ ...production, STAGING_ENVIRONMENT: "true" },
			"consumer",
		],
		["staging", staging, "classic"],
		["local development", { NODE_ENV: "development" }, "classic"],
		["tests", { NODE_ENV: "test" }, "classic"],
		["no NODE_ENV", {}, "classic"],
	] as const)("%s defaults to %s", (_, runtimeEnv, expected) => {
		expect(createKafkaGroupProtocolEnv({ runtimeEnv })).toEqual({
			KAFKA_GROUP_PROTOCOL: expected,
		});
	});

	test("an explicit protocol overrides the environment's default", () => {
		expect(
			createKafkaGroupProtocolEnv({
				runtimeEnv: { ...staging, KAFKA_GROUP_PROTOCOL: "consumer" },
			}),
		).toEqual({ KAFKA_GROUP_PROTOCOL: "consumer" });
		expect(
			createKafkaGroupProtocolEnv({
				runtimeEnv: { ...production, KAFKA_GROUP_PROTOCOL: "classic" },
			}),
		).toEqual({ KAFKA_GROUP_PROTOCOL: "classic" });
	});
});
