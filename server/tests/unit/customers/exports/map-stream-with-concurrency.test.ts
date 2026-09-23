/**
 * The billing-verify export ran one mapWithConcurrency per page, so a page
 * could not finish until its slowest customer did and the next page could not
 * start at all. One straggler idled every other slot for up to the customer
 * timeout, and pages whose candidates were sparse left most slots unused.
 *
 * mapStreamWithConcurrency keeps a single pool fed by the page walk: a slow
 * item occupies one slot, never the whole page.
 */

import { describe, expect, it } from "bun:test";
import { mapStreamWithConcurrency } from "@/internal/customers/exports/workflows/upload/mapStreamWithConcurrency.js";

const listOf = async function* (values: number[][]) {
	for (const value of values) yield value;
};

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

const collect = async <T>(stream: AsyncGenerator<T>) => {
	const seen: T[] = [];
	for await (const value of stream) seen.push(value);
	return seen;
};

describe("mapStreamWithConcurrency", () => {
	it("yields a result for every item across every batch", async () => {
		const results = await collect(
			mapStreamWithConcurrency({
				batches: listOf([
					[1, 2, 3],
					[4, 5],
				]),
				concurrency: 2,
				run: async (value: number) => value * 10,
			}),
		);

		expect([...results].sort((left, right) => left - right)).toEqual([
			10, 20, 30, 40, 50,
		]);
	});

	it("keeps every slot busy while one item is slow", async () => {
		const blocker = deferred();
		const started: number[] = [];
		let inFlight = 0;
		let peakInFlight = 0;

		const stream = mapStreamWithConcurrency({
			batches: listOf([[0, 1, 2, 3]]),
			concurrency: 4,
			run: async (value: number) => {
				started.push(value);
				inFlight++;
				peakInFlight = Math.max(peakInFlight, inFlight);
				await blocker.promise;
				inFlight--;
				return value;
			},
		});

		const collected = collect(stream);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const startedWhileBlocked = [...started];
		blocker.resolve();
		await collected;

		expect(startedWhileBlocked).toEqual([0, 1, 2, 3]);
		expect(peakInFlight).toBe(4);
	});

	it("starts the next batch before the current one has fully drained", async () => {
		const blocker = deferred();
		const started: number[] = [];

		const stream = mapStreamWithConcurrency({
			batches: listOf([[1], [2]]),
			concurrency: 2,
			run: async (value: number) => {
				started.push(value);
				if (value === 1) await blocker.promise;
				return value;
			},
		});

		const collected = collect(stream);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const startedBeforeUnblock = [...started];
		blocker.resolve();
		await collected;

		expect(startedBeforeUnblock).toContain(2);
	});

	it("never exceeds the concurrency limit", async () => {
		let inFlight = 0;
		let peakInFlight = 0;

		await collect(
			mapStreamWithConcurrency({
				batches: listOf([[1, 2, 3, 4, 5, 6, 7, 8]]),
				concurrency: 3,
				run: async (value: number) => {
					inFlight++;
					peakInFlight = Math.max(peakInFlight, inFlight);
					await new Promise((resolve) => setTimeout(resolve, 1));
					inFlight--;
					return value;
				},
			}),
		);

		expect(peakInFlight).toBe(3);
	});

	it("surfaces a failure and stops starting new items", async () => {
		let started = 0;

		const stream = mapStreamWithConcurrency({
			batches: listOf([[1, 2, 3, 4, 5, 6, 7, 8]]),
			concurrency: 2,
			run: async (value: number) => {
				started++;
				if (value === 1) throw new Error("boom");
				await new Promise((resolve) => setTimeout(resolve, 5));
				return value;
			},
		});

		await expect(collect(stream)).rejects.toThrow("boom");
		expect(started).toBeLessThan(8);
	});

	it("reports each batch once every one of its items has settled", async () => {
		const completed: Array<{ size: number; results: number }> = [];

		await collect(
			mapStreamWithConcurrency({
				batches: listOf([
					[1, 2],
					[3, 4, 5],
				]),
				concurrency: 4,
				run: async (value: number) => value,
				onBatchSettled: async ({ batch, results }) => {
					completed.push({ size: batch.length, results: results.length });
				},
			}),
		);

		expect(completed).toEqual([
			{ size: 2, results: 2 },
			{ size: 3, results: 3 },
		]);
	});
});
