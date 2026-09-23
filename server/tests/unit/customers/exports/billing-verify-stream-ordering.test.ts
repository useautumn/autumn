/**
 * The pool spans pages, so page N's subscriptions can still be in the swept Map
 * while page N+1's customers are already verifying. releaseSweptSubscriptions
 * must therefore run against the page that actually settled, in walk order —
 * releasing the wrong page would strip subscriptions a later customer needs and
 * silently turn a real mismatch into a clean row.
 */

import { describe, expect, it } from "bun:test";
import { mapStreamWithConcurrency } from "@/internal/customers/exports/workflows/upload/mapStreamWithConcurrency.js";

const pagesOf = async function* (pages: string[][]) {
	for (const page of pages) yield page;
};

describe("billing verify page settlement", () => {
	it("settles pages in walk order even when later work finishes first", async () => {
		const settled: string[][] = [];
		const delays: Record<string, number> = { a: 30, b: 0, c: 0, d: 0 };

		const stream = mapStreamWithConcurrency({
			batches: pagesOf([
				["a", "b"],
				["c", "d"],
			]),
			concurrency: 4,
			run: async (id: string) => {
				await new Promise((resolve) => setTimeout(resolve, delays[id]));
				return id;
			},
			onBatchSettled: ({ results }) => {
				settled.push([...results].sort());
			},
		});

		for await (const _ of stream) {
			// drain
		}

		expect(settled).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("does not settle a page until its own slowest item is done", async () => {
		const settledDuringBlock: string[][] = [];
		let releaseFirstPage!: () => void;
		const blocked = new Promise<void>((resolve) => {
			releaseFirstPage = resolve;
		});

		const stream = mapStreamWithConcurrency({
			batches: pagesOf([["slow"], ["fast"]]),
			concurrency: 4,
			run: async (id: string) => {
				if (id === "slow") await blocked;
				return id;
			},
			onBatchSettled: ({ results }) => {
				settledDuringBlock.push([...results]);
			},
		});

		const drained = (async () => {
			for await (const _ of stream) {
				// drain
			}
		})();

		await new Promise((resolve) => setTimeout(resolve, 20));
		const beforeRelease = settledDuringBlock.length;
		releaseFirstPage();
		await drained;

		expect(beforeRelease).toBe(0);
		expect(settledDuringBlock).toEqual([["slow"], ["fast"]]);
	});

	it("settles an empty page without consuming another page's slot", async () => {
		const settledSizes: number[] = [];

		const stream = mapStreamWithConcurrency({
			batches: pagesOf([[], ["x"], []]),
			concurrency: 2,
			run: async (id: string) => id,
			onBatchSettled: ({ batch }) => {
				settledSizes.push(batch.length);
			},
		});

		for await (const _ of stream) {
			// drain
		}

		expect(settledSizes).toEqual([0, 1, 0]);
	});
});
