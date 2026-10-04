import { describe, expect, test } from "bun:test";
import { createRequestLatencies } from "../../../src/logging/requestLatencies.js";

describe("request latencies", () => {
	test("tracks and checks get their own percentiles, and a drain starts a new window", () => {
		const latencies = createRequestLatencies();
		for (let i = 1; i <= 100; i++)
			latencies.record({ path: "/v1/track", durationMs: i });
		for (let i = 1; i <= 10; i++)
			latencies.record({ path: "/v1/track-batch", durationMs: 1000 });
		latencies.record({ path: "/v1/check", durationMs: 0.5 });
		latencies.record({ path: "/v1/read-subject-state", durationMs: 99 });
		const window = latencies.drain();
		expect(window.latencyMs).toEqual({
			p50: 56,
			p99: 1000,
			max: 1000,
			count: 110,
		});
		expect(window.checkLatencyMs).toEqual({
			p50: 0.5,
			p99: 0.5,
			max: 0.5,
			count: 1,
		});
		expect(latencies.drain()).toEqual({
			latencyMs: null,
			checkLatencyMs: null,
		});
	});

	test("a burst beyond the reservoir keeps the count exact and the percentiles close", () => {
		let seed = 7;
		const random = () => {
			seed = (seed * 48271) % 2147483647;
			return seed / 2147483647;
		};
		const latencies = createRequestLatencies({ reservoir: 512, random });
		for (let i = 0; i < 50_000; i++)
			latencies.record({ path: "/v1/track", durationMs: (i % 1000) + 1 });
		const { latencyMs } = latencies.drain();
		expect(latencyMs?.count).toBe(50_000);
		expect(latencyMs?.max).toBe(1000);
		expect(latencyMs?.p50).toBeGreaterThan(400);
		expect(latencyMs?.p50).toBeLessThan(600);
		expect(latencyMs?.p99).toBeGreaterThan(950);
	});
});
