import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { MutateParams } from "../../../../src/processor/writer/types/mutation.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../../fixtures/mutations.js";

const topic = "writer-evict-deletes";
const partition = 2;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const customerKey = meteringIdentityToPartitionKey({ identity });

const decideTrack = ({
	state,
	command,
}: MutateParams & { command: TrackCommand }) => {
	if (!state) throw new Error("Expected resident state");
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command,
	});
	return {
		kind: "write" as const,
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

/** A writer over a store that records applies and DELETEs in the order they are asked; the DELETE waits on `deleteGate`. */
const createWriter = () => {
	const events: string[] = [];
	const deleteGate = { held: Promise.resolve() as Promise<void> };
	let deleteFailure: Error | null = null;
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			events.push("apply");
			return records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			}));
		},
		evictDeletes: {
			deleteCustomer: async (params) => {
				events.push(`delete ${params.customerKey}`);
				await deleteGate.held;
				if (deleteFailure) throw deleteFailure;
				events.push("deleted");
			},
		},
	};
	let nextOffset = 0n;
	const writer = createPartitionWriter({
		ctx: {
			stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
		},
		config: {
			topic,
			partition,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 10,
			},
		},
	});
	const track = (commandId: string) =>
		writer.decide({
			command: createTrackCommand({ identity, value: 1, commandId }),
			mutate: ({ state }) =>
				decideTrack({
					state,
					command: createTrackCommand({ identity, value: 1, commandId }),
				}),
		});
	return {
		writer,
		events,
		deleteGate,
		track,
		failDeletes: (error: Error) => {
			deleteFailure = error;
		},
	};
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("an evict's snapshot DELETE", () => {
	test("is asked only once the store holds the customer's earlier writes, so it lands after them on the lane", async () => {
		const { writer, events, track } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		const tracked = track("t1");
		await tracked.waitForCommit();

		await writer.evict({ customerKey });

		expect(events).toEqual(["apply", `delete ${customerKey}`, "deleted"]);
		expect(writer.readFreshestState({ identity })).toBeNull();
	});

	test("the evict resolves only once the DELETE has committed", async () => {
		const { writer, events, deleteGate } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		const held = Promise.withResolvers<void>();
		deleteGate.held = held.promise;
		let settled = false;
		const evicted = writer.evict({ customerKey }).then(() => {
			settled = true;
		});
		await tick();
		await tick();
		expect(events).toEqual([`delete ${customerKey}`]);
		expect(settled).toBe(false);

		held.resolve();
		await evicted;
		expect(events).toEqual([`delete ${customerKey}`, "deleted"]);
	});

	test("a DELETE that cannot land fails the evict, so the caller retries it", async () => {
		const { writer, failDeletes } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		failDeletes(new Error("relation subject_snapshots does not exist"));

		await expect(writer.evict({ customerKey })).rejects.toThrow(
			"subject_snapshots does not exist",
		);
	});

	test("a deferred DELETE is handed to the caller and the evict returns once the rows are gone from memory", async () => {
		const { writer, deleteGate } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		const held = Promise.withResolvers<void>();
		deleteGate.held = held.promise;
		const deferred: Promise<void>[] = [];

		await writer.evict({
			customerKey,
			deferSnapshotDelete: (deleted) => deferred.push(deleted),
		});

		expect(writer.readFreshestState({ identity })).toBeNull();
		expect(deferred).toHaveLength(1);
		held.resolve();
		await Promise.all(deferred);
	});

	test("a store without evict deletes evicts the rows and owes nothing", async () => {
		const { writer, events, track } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		await track("t1").waitForStore();
		const bare = createPartitionWriter({
			ctx: {
				stateStore: {
					baseline: "map",
					readState: () => null,
					readOwnState: () => null,
					readReceipt: () => null,
					applyDurableMutations: async () => [],
				},
				appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
				receiptPolicy: { retentionMs: 60_000, now: () => 0 },
				recentCommands: createRecentCommands({ windowMs: 1, now: () => 0 }),
			},
			config: {
				topic,
				partition,
				limits: {
					maxBatchSize: 1,
					maxPendingCommands: 1,
					maxPendingCommandsPerCustomer: 1,
				},
			},
		});
		bare.adopt({ state: createState({ identity, balance: 1 }) });
		await bare.evict({ customerKey });
		expect(bare.readFreshestState({ identity })).toBeNull();
		expect(events).toEqual(["apply"]);
	});
});
