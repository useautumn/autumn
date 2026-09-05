import { describe, expect, test } from "bun:test";
import { resolveKafkaTestBrokers } from "./kafkaTestEnvironment.ts";

describe("Kafka integration environment", () => {
	test("reuses the worktree broker without loading unrelated server secrets", () => {
		expect(
			resolveKafkaTestBrokers({
				runtimeEnv: {},
				worktreeEnv: "DATABASE_URL=ignored\nKAFKA_BROKERS=127.0.0.1:19592\n",
			}),
		).toBe("127.0.0.1:19592");
	});

	test("explicit sandbox or CI brokers take precedence over local files", () => {
		expect(
			resolveKafkaTestBrokers({
				runtimeEnv: { KAFKA_BROKERS: "kafka:9092, kafka-2:9092" },
				worktreeEnv: "KAFKA_BROKERS=127.0.0.1:19592",
			}),
		).toBe("kafka:9092,kafka-2:9092");
	});

	test("missing or empty brokers fail instead of selecting another environment", () => {
		for (const value of [undefined, "", "   "]) {
			expect(() =>
				resolveKafkaTestBrokers({
					runtimeEnv: { KAFKA_BROKERS: value },
					worktreeEnv: undefined,
				}),
			).toThrow("Kafka integration tests require KAFKA_BROKERS");
		}
		expect(() =>
			resolveKafkaTestBrokers({
				runtimeEnv: { KAFKA_BROKERS: "localhost:19092," },
				worktreeEnv: undefined,
			}),
		).toThrow("non-empty broker addresses");
	});
});
