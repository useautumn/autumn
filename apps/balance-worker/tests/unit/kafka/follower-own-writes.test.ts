import { expect, test } from "bun:test";
import { createMeteringRecordHandler } from "../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import { createProducedOffsets } from "../../../src/processor/writer/producedOffsets/createProducedOffsets.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { restoreSubjectStates } from "../../fixtures/mutations.js";
import {
	closeStoreFixture,
	createMutation,
	createState,
	createStoreFixture,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

const ownEpoch = 7n;

test("a lingering writer batch still lands when the follower reads a later own record before the writer remembers its offset", async () => {
	const fixture = createStoreFixture();
	const producedOffsets = createProducedOffsets();
	const handler = createMeteringRecordHandler({
		ctx: {
			stateStore: fixture.store,
			partitionOffsets: { fetchTopicOffsets: async () => [] },
			recentCommandsByPartition: new Map([
				[partition, createRecentCommands({ windowMs: 1_000, now: () => 0 })],
			]),
			producedOffsetsByPartition: new Map([[partition, producedOffsets]]),
			ownerEpochByPartition: new Map([[partition, () => String(ownEpoch)]]),
			replayFloorByPartition: new Map(),
			replayByPartition: new Map(),
		},
	});
	try {
		const state = createState();
		restoreSubjectStates({
			store: fixture.store,
			topic,
			partition,
			states: [state],
		});
		const lingering = {
			position: { topic, partition, offset: 0n },
			mutation: createMutation({ state, commandId: "cmd_lingering" }),
		};
		producedOffsets.remember({ from: 0n, to: 0n });

		expect(handler.shouldApply?.(lingering.position)).toBe(false);
		await handler.applyRecord({
			position: { topic, partition, offset: 1n },
			record: createMutation({ state, commandId: "cmd_not_yet_remembered" }),
			ownerEpoch: ownEpoch,
		});
		expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);

		const [landed] = await fixture.store.applyDurableMutations({
			records: [lingering],
		});
		expect(landed?.kind).toBe("applied");
	} finally {
		closeStoreFixture(fixture);
	}
});

test("a record under an earlier owner's epoch on a writing partition still goes to the store", async () => {
	const fixture = createStoreFixture();
	const handler = createMeteringRecordHandler({
		ctx: {
			stateStore: fixture.store,
			partitionOffsets: { fetchTopicOffsets: async () => [] },
			recentCommandsByPartition: new Map([
				[partition, createRecentCommands({ windowMs: 1_000, now: () => 0 })],
			]),
			producedOffsetsByPartition: new Map([
				[partition, createProducedOffsets()],
			]),
			ownerEpochByPartition: new Map([[partition, () => String(ownEpoch)]]),
			replayFloorByPartition: new Map(),
			replayByPartition: new Map(),
		},
	});
	try {
		const state = createState();
		restoreSubjectStates({
			store: fixture.store,
			topic,
			partition,
			states: [state],
		});
		await handler.applyRecord({
			position: { topic, partition, offset: 0n },
			record: createMutation({ state }),
			ownerEpoch: ownEpoch - 1n,
		});

		expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
	} finally {
		closeStoreFixture(fixture);
	}
});
