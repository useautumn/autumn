import { describe, expect, test } from "bun:test";
import { createSliceRunner } from "@/internal/metering/worker/sliceRunner.js";

describe("createSliceRunner", () => {
	test("yields exactly every budgetEvents ticks when the clock never advances", async () => {
		const clock = { now: 0 };
		let yields = 0;
		const sliceRunner = createSliceRunner({
			budgetMs: 1_000,
			budgetEvents: 32,
			yieldFn: async () => {
				yields++;
			},
			now: () => clock.now,
		});

		for (let i = 0; i < 32; i++) {
			await sliceRunner.tick();
		}
		expect(yields).toBe(1);

		for (let i = 0; i < 31; i++) {
			await sliceRunner.tick();
		}
		expect(yields).toBe(1);

		await sliceRunner.tick();
		expect(yields).toBe(2);
	});

	test("yields as soon as the wall-time budget elapses, even under the event budget", async () => {
		const clock = { now: 0 };
		let yields = 0;
		const sliceRunner = createSliceRunner({
			budgetMs: 1,
			budgetEvents: 1_000,
			yieldFn: async () => {
				yields++;
			},
			now: () => clock.now,
		});

		clock.now = 0.4;
		await sliceRunner.tick();
		expect(yields).toBe(0);

		clock.now = 0.9;
		await sliceRunner.tick();
		expect(yields).toBe(0);

		clock.now = 1.1;
		await sliceRunner.tick();
		expect(yields).toBe(1);
	});

	test("starts a fresh turn (event count and clock) after each yield", async () => {
		const clock = { now: 0 };
		const yieldedAtTick: number[] = [];
		let tickCount = 0;
		const sliceRunner = createSliceRunner({
			budgetMs: 100,
			budgetEvents: 3,
			yieldFn: async () => {
				yieldedAtTick.push(tickCount);
			},
			now: () => clock.now,
		});

		for (let i = 0; i < 9; i++) {
			tickCount++;
			clock.now += 1;
			await sliceRunner.tick();
		}

		expect(yieldedAtTick).toEqual([3, 6, 9]);
	});

	test("the first tick alone can trigger a yield if budgetEvents is 1", async () => {
		let yields = 0;
		const sliceRunner = createSliceRunner({
			budgetMs: 1_000,
			budgetEvents: 1,
			yieldFn: async () => {
				yields++;
			},
			now: () => 0,
		});

		await sliceRunner.tick();
		expect(yields).toBe(1);
	});
});
