import { describe, expect, test } from "bun:test";
import { createTickAccumulator } from "@/internal/metering/loadtest/tickAccumulator.js";

describe("createTickAccumulator", () => {
	test("an evenly-dividing rate yields a constant batch size every tick", () => {
		// 500 events/sec at a 50ms tick is exactly 25 events/tick.
		const accumulator = createTickAccumulator({
			ratePerSec: 500,
			tickIntervalMs: 50,
		});

		const batches = Array.from({ length: 10 }, () => accumulator.next());

		expect(batches).toEqual(Array(10).fill(25));
		expect(batches.reduce((sum, batch) => sum + batch, 0)).toBe(250);
	});

	test("a zero rate never produces a batch", () => {
		const accumulator = createTickAccumulator({
			ratePerSec: 0,
			tickIntervalMs: 50,
		});

		for (let index = 0; index < 20; index++) {
			expect(accumulator.next()).toBe(0);
		}
	});

	test("carries the fractional remainder forward instead of dropping it", () => {
		// 13 events/sec at a 50ms tick is 0.65 events/tick — batches must
		// alternate between 0 and 1 in a pattern that sums correctly, never
		// silently rounding every tick down to 0.
		const accumulator = createTickAccumulator({
			ratePerSec: 13,
			tickIntervalMs: 50,
		});

		const tickCount = 1000; // 1000 * 50ms = 50s of simulated ticks
		const batches = Array.from({ length: tickCount }, () => accumulator.next());
		const total = batches.reduce((sum, batch) => sum + batch, 0);

		expect(total).toBe(Math.floor((13 * tickCount * 50) / 1000));
		expect(batches.some((batch) => batch > 0)).toBe(true);
	});

	test("cumulative sent count never drifts more than one event from the ideal rate", () => {
		// Bounded by construction: the carried remainder is always < 1 event,
		// so cumulative sent can only ever be within one event of the ideal
		// continuous rate — never compounding further out over the run.
		const ratePerSec = 137;
		const tickIntervalMs = 50;
		const accumulator = createTickAccumulator({ ratePerSec, tickIntervalMs });

		let cumulative = 0;
		for (let tick = 1; tick <= 2000; tick++) {
			cumulative += accumulator.next();
			const idealAtThisTick = (ratePerSec * tick * tickIntervalMs) / 1000;
			expect(Math.abs(cumulative - idealAtThisTick)).toBeLessThanOrEqual(1);
		}
	});

	test("each accumulator instance tracks its own independent carry", () => {
		const a = createTickAccumulator({ ratePerSec: 7, tickIntervalMs: 50 });
		const b = createTickAccumulator({ ratePerSec: 7, tickIntervalMs: 50 });

		const aFirst = a.next();
		for (let index = 0; index < 5; index++) a.next();

		expect(b.next()).toBe(aFirst);
	});

	test("a negative rate is clamped to zero rather than producing negative batches", () => {
		const accumulator = createTickAccumulator({
			ratePerSec: -50,
			tickIntervalMs: 50,
		});

		expect(accumulator.next()).toBe(0);
		expect(accumulator.next()).toBe(0);
	});
});
