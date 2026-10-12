import { describe, expect, test } from "bun:test";
import { DbControlEdgeConfigSchema } from "../../src/edgeConfig.js";

const parseMaxBatchesPerFlush = (maxBatchesPerFlush: unknown) =>
	DbControlEdgeConfigSchema.safeParse({
		balanceCommitter: { maxBatchesPerFlush },
	});

describe("DbControlEdgeConfigSchema balanceCommitter.maxBatchesPerFlush", () => {
	test("defaults to null, so a stored config without it keeps the worker's value", () => {
		const parsed = DbControlEdgeConfigSchema.parse({
			balanceCommitter: { concurrency: 4, applyLingerMs: 500 },
		});
		expect(parsed.balanceCommitter.maxBatchesPerFlush).toBeNull();
	});

	test("accepts integers in [1, 64]", () => {
		for (const value of [1, 32, 64]) {
			expect(parseMaxBatchesPerFlush(value).success).toBe(true);
		}
	});

	test("rejects zero, negatives, non-integers and values past 64", () => {
		for (const value of [0, -1, 2.5, 65, "32"]) {
			expect(parseMaxBatchesPerFlush(value).success).toBe(false);
		}
	});
});
