import { describe, expect, test } from "bun:test";
import { computeLatencyStats } from "@/internal/metering/loadtest/percentiles.js";

describe("computeLatencyStats", () => {
	test("returns zeroed stats for an empty sample set", () => {
		expect(computeLatencyStats({ samplesMs: [] })).toEqual({
			p50: 0,
			p95: 0,
			p99: 0,
			max: 0,
		});
	});

	test("a single sample is every percentile and the max", () => {
		expect(computeLatencyStats({ samplesMs: [42] })).toEqual({
			p50: 42,
			p95: 42,
			p99: 42,
			max: 42,
		});
	});

	test("computes nearest-rank percentiles over a known 1..100 range", () => {
		const samplesMs = Array.from({ length: 100 }, (_, index) => index + 1);

		expect(computeLatencyStats({ samplesMs })).toEqual({
			p50: 51,
			p95: 96,
			p99: 100,
			max: 100,
		});
	});

	test("is unaffected by input order", () => {
		const ascending = Array.from({ length: 50 }, (_, index) => index + 1);
		const shuffled = [...ascending].reverse();

		expect(computeLatencyStats({ samplesMs: shuffled })).toEqual(
			computeLatencyStats({ samplesMs: ascending }),
		);
	});

	test("does not mutate the input array", () => {
		const samplesMs = [5, 3, 1, 4, 2];
		const original = [...samplesMs];

		computeLatencyStats({ samplesMs });

		expect(samplesMs).toEqual(original);
	});

	test("max always reflects the largest sample regardless of percentile rounding", () => {
		const samplesMs = [1, 1, 1, 1, 1, 1, 1, 1, 1, 9999];

		expect(computeLatencyStats({ samplesMs }).max).toBe(9999);
	});
});
