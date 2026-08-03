import { describe, expect, test } from "bun:test";
import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { iterateBatchMigrationChunks } from "@/internal/migrations/v2/run/chunks/iterateBatchMigrationChunks.js";

const chunkResult = (
	overrides: Partial<BatchMigrationChunkResult>,
): BatchMigrationChunkResult => ({
	processed: 0,
	completion: "exhausted",
	cursor: null,
	summary: { pages: 0, succeeded: 0, skipped: 0, phases: {} },
	...overrides,
});

describe("iterateBatchMigrationChunks", () => {
	test("re-dispatches budgeted chunks from the returned cursor until exhausted", async () => {
		const calls: { chunkIndex: number; cursor: string | undefined }[] = [];
		const results = [
			chunkResult({
				processed: 100_000,
				completion: "slice_complete",
				cursor: "cus_a",
				summary: { pages: 20, succeeded: 100_000, skipped: 0, phases: {} },
			}),
			chunkResult({
				processed: 100_000,
				completion: "slice_complete",
				cursor: "cus_b",
				summary: { pages: 20, succeeded: 99_000, skipped: 1_000, phases: {} },
			}),
			chunkResult({
				processed: 40_000,
				completion: "exhausted",
				cursor: "cus_c",
				summary: { pages: 8, succeeded: 40_000, skipped: 0, phases: {} },
			}),
		];

		const outcome = await iterateBatchMigrationChunks({
			runChunk: async (args) => {
				calls.push(args);
				return results[calls.length - 1];
			},
		});

		expect(calls).toEqual([
			{ chunkIndex: 0, cursor: undefined },
			{ chunkIndex: 1, cursor: "cus_a" },
			{ chunkIndex: 2, cursor: "cus_b" },
		]);
		expect(outcome).toEqual({ processed: 240_000, pages: 48, canceled: false });
	});

	test("stops immediately on a canceled chunk", async () => {
		let calls = 0;
		const outcome = await iterateBatchMigrationChunks({
			runChunk: async () => {
				calls++;
				return chunkResult({
					processed: 5_000,
					completion: "stopped",
					cursor: "cus_a",
					summary: { pages: 1, succeeded: 5_000, skipped: 0, phases: {} },
				});
			},
		});

		expect(calls).toBe(1);
		expect(outcome).toEqual({ processed: 5_000, pages: 1, canceled: true });
	});
});
