import { afterEach, describe, expect, test } from "bun:test";
import {
	computeUtilization,
	MAX_ACQUIRE_SAMPLES,
	reservoirInsert,
} from "@/db/pgPoolMonitor.js";

const originalRandom = Math.random;

afterEach(() => {
	Math.random = originalRandom;
});

describe("reservoirInsert", () => {
	test("buffer caps at MAX_ACQUIRE_SAMPLES", () => {
		const samples: number[] = [];
		const total = MAX_ACQUIRE_SAMPLES + 1_000;
		for (let observed = 1; observed <= total; observed++) {
			reservoirInsert({ samples, observed, value: observed });
		}
		expect(samples).toHaveLength(MAX_ACQUIRE_SAMPLES);
	});

	test("later values can replace earlier ones once full", () => {
		const samples = [1, 2, 3];
		Math.random = () => 0;
		reservoirInsert({ samples, observed: 4, value: 99, capacity: 3 });
		expect(samples).toEqual([99, 2, 3]);
	});

	test("later values can be skipped once full", () => {
		const samples = [1, 2, 3];
		Math.random = () => 0.999;
		reservoirInsert({ samples, observed: 4, value: 99, capacity: 3 });
		expect(samples).toEqual([1, 2, 3]);
	});

	test("sample is not biased toward the start of the stream", () => {
		const samples: number[] = [];
		const capacity = 100;
		const total = 10_000;
		for (let observed = 1; observed <= total; observed++) {
			reservoirInsert({ samples, observed, value: observed, capacity });
		}
		// First-N sampling would keep only values <= capacity; a uniform
		// reservoir keeps ~half above the midpoint (P(none) ~ 2^-100).
		const fromSecondHalf = samples.filter((value) => value > total / 2);
		expect(fromSecondHalf.length).toBeGreaterThan(0);
	});
});

describe("computeUtilization", () => {
	test("counts only busy clients", () => {
		expect(
			computeUtilization({ totalCount: 10, idleCount: 4, max: 20 }),
		).toBeCloseTo(0.3);
	});

	test("fully idle pool is 0", () => {
		expect(computeUtilization({ totalCount: 10, idleCount: 10, max: 20 })).toBe(
			0,
		);
	});

	test("clamps to 0..1", () => {
		expect(computeUtilization({ totalCount: 5, idleCount: 9, max: 20 })).toBe(
			0,
		);
		expect(computeUtilization({ totalCount: 30, idleCount: 0, max: 20 })).toBe(
			1,
		);
	});

	test("max of 0 is 0", () => {
		expect(computeUtilization({ totalCount: 5, idleCount: 0, max: 0 })).toBe(0);
	});
});
