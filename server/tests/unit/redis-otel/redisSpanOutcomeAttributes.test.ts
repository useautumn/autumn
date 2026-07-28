import { describe, expect, test } from "bun:test";
import { buildRedisSpanOutcomeAttributes } from "@/external/redis/otel/redisSpanOutcomeAttributes.js";

describe("Redis span outcome attributes", () => {
	test("preserves duration and breach ratio for existing Axiom queries", () => {
		const attributes = buildRedisSpanOutcomeAttributes({
			durationMs: 30,
			slowMs: 15,
		});

		expect(attributes).toEqual({
			"db.redis.duration_ms": 30,
			"db.redis.slow": true,
			"db.redis.breach_ratio": 2,
		});
	});

	test("preserves duration without marking successful non-slow spans as slow", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 10,
				slowMs: 15,
			}),
		).toEqual({
			"db.redis.duration_ms": 10,
		});
	});

	test("does not classify a span exactly at the slow threshold as slow", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 15,
				slowMs: 15,
			}),
		).toEqual({
			"db.redis.duration_ms": 15,
		});
	});

	test("retains the original zero-threshold breach-ratio fallback", () => {
		expect(
			buildRedisSpanOutcomeAttributes({
				durationMs: 0.01,
				slowMs: 0,
			}),
		).toEqual({
			"db.redis.duration_ms": 0.01,
			"db.redis.slow": true,
			"db.redis.breach_ratio": 0,
		});
	});
});
