import { expect, test } from "bun:test";
import { createMeteringRecordHandler } from "../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import { createCommitSummaries } from "../../../src/logging/commitSummaries.js";
import { createProducedOffsets } from "../../../src/processor/writer/producedOffsets/createProducedOffsets.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { DurableMutationRecord } from "../../../src/state/types/durableMutation.js";
import type { StateStore } from "../../../src/state/types/stateStore.js";
import { createMutation, createState } from "./kafka-test-fixtures.js";

const topic = "events";
const writing = 3;
const following = 4;

const createHandler = () => {
	const summaries = createCommitSummaries();
	const produced = createProducedOffsets();
	const applied: DurableMutationRecord[][] = [];
	const stateStore = {
		readNextOffset: () => null,
		applyDurableMutations: ({
			records,
		}: {
			records: DurableMutationRecord[];
		}) => {
			applied.push(records);
			return [{ kind: "position_already_applied", nextOffset: 0n }];
		},
	} as unknown as StateStore;
	const handler = createMeteringRecordHandler({
		ctx: {
			stateStore,
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
	return { handler, produced, summaries, applied };
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

test("a record under this writer's epoch never reaches the store from the follower, even before its offset is remembered", async () => {
	const { handler, summaries } = createHandler();
	const position = { topic, partition: writing, offset: 30n };

	expect(handler.shouldApply?.(position)).toBe(true);
	const result = await handler.applyRecord({
		position,
		record: createMutation({ state: createState() }),
		ownerEpoch: 1n,
	});

	expect(result).toBeUndefined();
	expect(summaries.drain()).toEqual([
		expect.objectContaining({
			partition: writing,
			followerMisses: 1,
			followerApplies: 0,
		}),
	]);
});

test("a record under another epoch on a writing partition still goes to the store", async () => {
	const { handler, summaries, applied } = createHandler();
	await handler.applyRecord({
		position: { topic, partition: writing, offset: 31n },
		record: createMutation({ state: createState() }),
		ownerEpoch: 0n,
	});

	expect(applied).toHaveLength(1);
	expect(summaries.drain()).toEqual([
		expect.objectContaining({ partition: writing, followerApplies: 1 }),
	]);
});
