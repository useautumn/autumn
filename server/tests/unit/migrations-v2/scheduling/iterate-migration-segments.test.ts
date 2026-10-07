// Contract: P segment chunks of one run cover every matching customer exactly once,
// and cancel / failure / exhaustion end the run only after the whole round settles.
import { describe, expect, test } from "bun:test";
import type { MigrationChunkResult } from "@/internal/migrations/v2/run/chunks/iterateMigrationChunks.js";
import {
	iterateMigrationSegments,
	type MigrationSegmentChunk,
} from "@/internal/migrations/v2/run/chunks/iterateMigrationSegments.js";

const PAGE_SIZE = 7;
const CHUNK_SLICE = 3;

const customerIds = (count: number) =>
	Array.from({ length: count }, (_, i) => `cus_${String(i).padStart(4, "0")}`)
		.sort()
		.reverse();

/** Fake keyset over `ids` (DESC) with a checkpoint: processed ids never match again. */
const createFakeMigration = ({ ids }: { ids: string[] }) => {
	const processedCount = new Map<string, number>();
	const isUnprocessed = (id: string) => !processedCount.has(id);
	const below = (cursor?: string) => (id: string) =>
		cursor === undefined || id < cursor;

	const loadIdPage = async ({ cursor }: { cursor?: string }) => {
		const matching = ids.filter(below(cursor)).filter(isUnprocessed);
		return {
			ids: matching.slice(0, PAGE_SIZE),
			isLastPage: matching.length <= PAGE_SIZE,
		};
	};

	const runChunk = (chunk: MigrationSegmentChunk): MigrationChunkResult => {
		const segment = ids
			.filter(below(chunk.cursor))
			.filter((id) => chunk.floor === undefined || id >= chunk.floor)
			.filter(isUnprocessed);
		const slice = segment.slice(0, CHUNK_SLICE);
		for (const id of slice)
			processedCount.set(id, (processedCount.get(id) ?? 0) + 1);
		return {
			processed: slice.length,
			completion: segment.length > CHUNK_SLICE ? "slice_complete" : "exhausted",
			cursor: slice.at(-1) ?? null,
		};
	};

	return { processedCount, loadIdPage, runChunk };
};

describe("iterateMigrationSegments", () => {
	test("P concurrent chunks cover every customer exactly once", async () => {
		for (const partitions of [2, 3, 4, 8]) {
			for (const count of [0, 1, PAGE_SIZE, PAGE_SIZE + 1, 50]) {
				const ids = customerIds(count);
				const fake = createFakeMigration({ ids });
				const roundSizes: number[] = [];

				const result = await iterateMigrationSegments({
					partitions,
					isCancelRequested: async () => false,
					loadIdPage: fake.loadIdPage,
					runRound: async (chunks) => {
						roundSizes.push(chunks.length);
						return chunks.map(fake.runChunk);
					},
				});

				expect(result.canceled).toBe(false);
				expect(result.processed).toBe(count);
				expect([...fake.processedCount.keys()].sort()).toEqual([...ids].sort());
				expect([...fake.processedCount.values()].every((n) => n === 1)).toBe(
					true,
				);
				expect(roundSizes.every((size) => size <= partitions)).toBe(true);
			}
		}
	});

	test("keeps P chunks in flight while the keyset has work", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		const roundSizes: number[] = [];

		await iterateMigrationSegments({
			partitions: 4,
			isCancelRequested: async () => false,
			loadIdPage: fake.loadIdPage,
			runRound: async (chunks) => {
				roundSizes.push(chunks.length);
				return chunks.map(fake.runChunk);
			},
		});

		expect(roundSizes[0]).toBe(4);
		expect(Math.max(...roundSizes)).toBe(4);
	});

	test("stops before the next round when cancellation is requested", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		let rounds = 0;

		const result = await iterateMigrationSegments({
			partitions: 3,
			isCancelRequested: async () => rounds >= 1,
			loadIdPage: fake.loadIdPage,
			runRound: async (chunks) => {
				rounds++;
				return chunks.map(fake.runChunk);
			},
		});

		expect(rounds).toBe(1);
		expect(result.canceled).toBe(true);
		expect(result.processed).toBe(9);
	});

	test("reports cancellation detected inside any chunk of the round", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });

		const result = await iterateMigrationSegments({
			partitions: 3,
			isCancelRequested: async () => false,
			loadIdPage: fake.loadIdPage,
			runRound: async (chunks) =>
				chunks.map((chunk, i) =>
					i === 1
						? { processed: 0, completion: "stopped", cursor: null }
						: fake.runChunk(chunk),
				),
		});

		expect(result.canceled).toBe(true);
		expect(result.chunks).toBe(3);
		expect(result.processed).toBe(6);
	});

	test("propagates a round failure without starting another round", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		let rounds = 0;

		await expect(
			iterateMigrationSegments({
				partitions: 3,
				isCancelRequested: async () => false,
				loadIdPage: fake.loadIdPage,
				runRound: async () => {
					rounds++;
					throw new Error("chunk failed");
				},
			}),
		).rejects.toThrow("chunk failed");
		expect(rounds).toBe(1);
	});

	test("rejects a continuation that made no progress", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });

		await expect(
			iterateMigrationSegments({
				partitions: 2,
				isCancelRequested: async () => false,
				loadIdPage: fake.loadIdPage,
				runRound: async (chunks) =>
					chunks.map(() => ({
						processed: 0,
						completion: "slice_complete",
						cursor: null,
					})),
			}),
		).rejects.toThrow("made no progress");
	});
});
