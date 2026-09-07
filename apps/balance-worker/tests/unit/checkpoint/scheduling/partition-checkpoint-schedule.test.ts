import { describe, expect, test } from "bun:test";
import {
	type PartitionCheckpointScheduleEntry,
	planPartitionCheckpoint,
} from "../../../../src/checkpoint/scheduling/partitionCheckpointSchedule.js";

const entry = (
	overrides: Partial<PartitionCheckpointScheduleEntry> = {},
): PartitionCheckpointScheduleEntry => ({
	generation: 1,
	nextOffset: 42n,
	lastConfirmedNextOffset: 40n,
	dirtySince: 100,
	nextAttemptAt: 200,
	...overrides,
});

describe("partition checkpoint schedule", () => {
	test("plans one due dirty assignment without changing its input", () => {
		const entries = [entry()];
		expect(
			planPartitionCheckpoint({ now: 200, entries, exportInFlight: false }),
		).toEqual({ kind: "export", generation: 1 });
		expect(entries).toEqual([entry()]);
	});

	test.each([
		{
			name: "unchanged",
			candidate: entry({ lastConfirmedNextOffset: 42n }),
			now: 200,
			exportInFlight: false,
		},
		{ name: "not due", candidate: entry(), now: 199, exportInFlight: false },
		{ name: "in flight", candidate: entry(), now: 200, exportInFlight: true },
	])("does no work when $name", ({ candidate, now, exportInFlight }) => {
		expect(
			planPartitionCheckpoint({ now, entries: [candidate], exportInFlight }),
		).toEqual({ kind: "idle" });
	});

	test("prioritizes the oldest outstanding change while respecting backoff", () => {
		const entries = [
			entry({ generation: 1, dirtySince: 150 }),
			entry({ generation: 2, dirtySince: 50 }),
			entry({ generation: 3, dirtySince: 0, nextAttemptAt: 300 }),
		];
		expect(
			planPartitionCheckpoint({ now: 200, entries, exportInFlight: false }),
		).toEqual({ kind: "export", generation: 2 });
	});

	test("checks an initial snapshot even for a partition at offset zero", () => {
		expect(
			planPartitionCheckpoint({
				now: 200,
				entries: [entry({ nextOffset: 0n, lastConfirmedNextOffset: null })],
				exportInFlight: false,
			}),
		).toEqual({ kind: "export", generation: 1 });
	});
});
