import { describe, expect, it } from "bun:test";
import { backoffDelayMs } from "@/utils/backoffDelayMs.js";

const ceilingFor = (attempt: number) =>
	backoffDelayMs({
		attempt,
		baseDelayMs: 1_000,
		maxDelayMs: 30_000,
		jitter: false,
	});

describe("backoffDelayMs", () => {
	it("doubles each attempt up to the ceiling", () => {
		expect([1, 2, 3, 4, 5, 6].map(ceilingFor)).toEqual([
			1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
		]);
	});

	it("keeps jittered delays inside the attempt's ceiling", () => {
		const delays = Array.from({ length: 50 }, () =>
			backoffDelayMs({ attempt: 3, baseDelayMs: 1_000, maxDelayMs: 30_000 }),
		);

		expect(Math.max(...delays)).toBeLessThanOrEqual(4_000);
		expect(Math.min(...delays)).toBeGreaterThanOrEqual(0);
		expect(new Set(delays).size).toBeGreaterThan(1);
	});
});
