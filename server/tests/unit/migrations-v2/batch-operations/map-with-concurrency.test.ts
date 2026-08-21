import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mapWithConcurrency", () => {
	test("results keep input order regardless of completion order", async () => {
		// Earlier items resolve later, so completion order is reversed.
		const delays = [30, 20, 10, 0];
		const results = await mapWithConcurrency({
			items: delays,
			concurrency: 4,
			run: async (delay) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				return delay;
			},
		});
		expect(results).toEqual(delays);
	});

	test("never exceeds the concurrency cap", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		await mapWithConcurrency({
			items: [1, 2, 3, 4, 5, 6, 7],
			concurrency: 3,
			run: async () => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await tick();
				inFlight--;
			},
		});
		expect(maxInFlight).toBe(3);
	});

	test("a failure stops new items but lets in-flight items finish", async () => {
		const started: number[] = [];
		const finished: number[] = [];
		let releaseSlow: () => void = () => {};
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});

		const attempt = mapWithConcurrency({
			items: [1, 2, 3, 4, 5],
			concurrency: 2,
			run: async (item) => {
				started.push(item);
				if (item === 1) {
					await tick();
					throw new Error(`item ${item} failed`);
				}
				await slowGate;
				finished.push(item);
			},
		});

		// Let the failure land while item 2 is still in flight, then release it.
		await tick();
		await tick();
		releaseSlow();

		expect(attempt).rejects.toThrow("item 1 failed");
		await attempt.catch(() => {});
		// Item 2 was already in flight and ran to completion; 3–5 never started.
		expect(started).toEqual([1, 2]);
		expect(finished).toEqual([2]);
	});

	test("rethrows the first error when several fail", async () => {
		const attempt = mapWithConcurrency({
			items: [10, 20],
			concurrency: 2,
			run: async (delay) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				throw new Error(`failed after ${delay}`);
			},
		});
		expect(attempt).rejects.toThrow("failed after 10");
	});

	test("empty input resolves without invoking run", async () => {
		let calls = 0;
		const results = await mapWithConcurrency({
			items: [] as number[],
			concurrency: 3,
			run: async () => {
				calls++;
			},
		});
		expect(results).toEqual([]);
		expect(calls).toBe(0);
	});
});
