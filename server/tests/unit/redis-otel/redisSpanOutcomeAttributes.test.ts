import { describe, expect, test } from "bun:test";
import { buildRedisSpanOutcomeAttributes } from "@/external/redis/otel/redisSpanOutcomeAttributes.js";

describe("Redis span outcome attributes", () => {
	test("marks slow spans without duplicating duration or derived breach ratio", () => {
		const attributes = buildRedisSpanOutcomeAttributes({
			durationMs: 30,
			slowMs: 15,
		});

		expect(attributes).toEqual({
			"db.redis.slow": true,
		});
		expect(attributes["db.redis.duration_ms"]).toBeUndefined();
		expect(attributes["db.redis.breach_ratio"]).toBeUndefined();
	});

	test("does not add outcome attributes to successful non-slow spans", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 10,
				slowMs: 15,
			}),
		).toEqual({});
	});

	test("does not classify a span exactly at the slow threshold as slow", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 15,
				slowMs: 15,
			}),
		).toEqual({});
	});

	test("classifies any positive duration as slow when the threshold is zero", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 0.01,
				slowMs: 0,
			}),
		).toEqual({ "db.redis.slow": true });
	});
});
