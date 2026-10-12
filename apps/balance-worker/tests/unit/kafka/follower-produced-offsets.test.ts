import { expect, test } from "bun:test";
import { createMeteringRecordHandler } from "../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import { createCommitSummaries } from "../../../src/logging/commitSummaries.js";
import { createProducedOffsets } from "../../../src/processor/writer/producedOffsets/createProducedOffsets.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { StateStore } from "../../../src/state/types/stateStore.js";

const topic = "events";
const writing = 3;
const following = 4;

const createHandler = () => {
	const summaries = createCommitSummaries();
	const produced = createProducedOffsets();
	const handler = createMeteringRecordHandler({
		ctx: {
			stateStore: {} as StateStore,
			partitionOffsets: { fetchTopicOffsets: async () => [] },
			recentCommandsByPartition: new Map([
				[writing, createRecentCommands({ windowMs: 1_000, now: () => 0 })],
			]),
			producedOffsetsByPartition: new Map([
				[writing, produced],
				[following, createProducedOffsets()],
			]),
			ownerEpochByPartition: new Map<number, () => string | undefined>([
				[writing, () => "1"],
				[following, () => undefined],
			]),
			replayFloorByPartition: new Map(),
			replayByPartition: new Map(),
			summaries,
		},
	});
	return { handler, produced, summaries };
};

test("counts a follower miss only on a partition this process is writing", () => {
	const { handler, produced, summaries } = createHandler();
	produced.remember({ from: 10n, to: 11n });

	expect(
		handler.shouldApply?.({ topic, partition: writing, offset: 10n }),
	).toBe(false);
	expect(
		handler.shouldApply?.({ topic, partition: writing, offset: 13n }),
	).toBe(true);
	expect(
		handler.shouldApply?.({ topic, partition: following, offset: 13n }),
	).toBe(true);

	expect(summaries.drain()).toEqual([
		expect.objectContaining({ partition: writing, followerMisses: 1 }),
	]);
});

test("a record the writer produces after the follower read it is counted as a miss", () => {
	const { handler, produced, summaries } = createHandler();

	expect(
		handler.shouldApply?.({ topic, partition: writing, offset: 20n }),
	).toBe(true);
	produced.remember({ from: 20n, to: 20n });

	expect(summaries.drain()).toEqual([
		expect.objectContaining({ partition: writing, followerMisses: 1 }),
	]);
});
