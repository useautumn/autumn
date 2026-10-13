import { describe, expect, test } from "bun:test";
import {
	DEFAULT_MAX_BATCHES_PER_FLUSH,
	DEFAULT_MAX_UNAPPLIED_BATCHES,
	maxBatchesPerFlushOf,
} from "../../../../src/processor/writer/pendingMutations.js";
import type { PartitionWriterLimits } from "../../../../src/processor/writer/types/partitionWriter.js";

const bootLimits: PartitionWriterLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 100,
	maxPendingCommandsPerCustomer: 100,
};

const dbControlWith = ({
	maxBatchesPerFlush,
}: {
	maxBatchesPerFlush: number | null;
}) => ({
	get: () => ({
		balanceCommitter: {
			concurrency: null,
			applyLingerMs: null,
			maxBatchesPerFlush,
		},
	}),
});

describe("maxBatchesPerFlushOf", () => {
	test("defaults to 32 with no boot value and no DB control", () => {
		expect(DEFAULT_MAX_BATCHES_PER_FLUSH).toBe(32);
		expect(maxBatchesPerFlushOf({ ctx: {}, limits: bootLimits })).toBe(32);
	});

	test("the boot value applies when DB control is unset", () => {
		expect(
			maxBatchesPerFlushOf({
				ctx: { dbControl: dbControlWith({ maxBatchesPerFlush: null }) },
				limits: { ...bootLimits, maxBatchesPerFlush: 8 },
			}),
		).toBe(8);
	});

	test("DB control's live value overrides the boot value", () => {
		expect(
			maxBatchesPerFlushOf({
				ctx: { dbControl: dbControlWith({ maxBatchesPerFlush: 12 }) },
				limits: { ...bootLimits, maxBatchesPerFlush: 8 },
			}),
		).toBe(12);
	});

	test("clamps to [1, maxUnappliedBatches]", () => {
		expect(
			maxBatchesPerFlushOf({
				ctx: {},
				limits: { ...bootLimits, maxBatchesPerFlush: 0 },
			}),
		).toBe(1);
		expect(
			maxBatchesPerFlushOf({
				ctx: { dbControl: dbControlWith({ maxBatchesPerFlush: 500 }) },
				limits: bootLimits,
			}),
		).toBe(DEFAULT_MAX_UNAPPLIED_BATCHES);
		expect(
			maxBatchesPerFlushOf({
				ctx: { dbControl: dbControlWith({ maxBatchesPerFlush: 32 }) },
				limits: { ...bootLimits, maxUnappliedBatches: 10 },
			}),
		).toBe(10);
	});
});
