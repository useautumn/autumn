import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createCommitter } from "../../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../../src/committer/createCommitterStateStore.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMapBudget } from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import type { MutateParams } from "../../../../src/processor/writer/types/mutation.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import type { CommitterDb } from "../../../../src/types/committerDb.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../fixtures/subjectSnapshotsStore.js";

const topic = "writer-evict-deletes";
const partition = 2;
const identityOf = (customerId: string): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});
const keyOf = (customerId: string) =>
	meteringIdentityToPartitionKey({ identity: identityOf(customerId) });

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

/** A writer whose store records applies and enqueued DELETEs in order; `applyGate` holds every apply until it resolves. */
const createWriter = ({
	subjectMapMaxBytes,
}: {
	subjectMapMaxBytes?: number;
} = {}) => {
	const events: string[] = [];
	const applyGate = { held: Promise.resolve() as Promise<void> };
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			await applyGate.held;
			events.push("apply");
			return records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			}));
		},
		snapshotWrites: {
			enqueueDelete: ({ customerKey }) => {
				events.push(`enqueue ${customerKey}`);
			},
			enqueueBackfill: () => {
				throw new Error("not exercised");
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
				...(subjectMapMaxBytes !== undefined && {
					subjectMapBudget: createSubjectMapBudget({
						totalBytes: subjectMapMaxBytes,
					}),
				}),
			},
		},
	});
	const track = ({
		customerId,
		commandId,
	}: {
		customerId: string;
		commandId: string;
	}) => {
		const identity = identityOf(customerId);
		const command = createTrackCommand({ identity, value: 1, commandId });
		return writer.decide({
			command,
			mutate: ({ state }) => decideTrack({ state, command }),
		});
	};
	const adopt = (customerId: string) =>
		writer.adopt({
			state: createState({ identity: identityOf(customerId), balance: 100 }),
			baselineAt: 1,
		});
	return { writer, events, applyGate, track, adopt };
};

describe("an evict's snapshot DELETE", () => {
	test("is enqueued synchronously when the drop leaves nothing of the customer resident, after its earlier writes are stored", async () => {
		const { writer, events, track, adopt } = createWriter();
		adopt("cus_1");
		await track({ customerId: "cus_1", commandId: "t1" }).waitForCommit();

		const evicted = writer.evict({ customerKey: keyOf("cus_1") });
		await evicted;

		expect(events).toEqual(["apply", `enqueue ${keyOf("cus_1")}`]);
		expect(
			writer.readFreshestState({ identity: identityOf("cus_1") }),
		).toBeNull();
	});

	test("a record decided on the rows meanwhile re-pins them: the drop and its DELETE wait for that record's store", async () => {
		const { writer, events, applyGate, track, adopt } = createWriter();
		adopt("cus_1");
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		const before = track({ customerId: "cus_1", commandId: "t1" });
		await before.waitForCommit();
		const evicted = writer.evict({ customerKey: keyOf("cus_1") });
		const meanwhile = track({ customerId: "cus_1", commandId: "t2" });
		await meanwhile.waitForCommit();
		expect(events).toEqual([]);

		held.resolve();
		await before.waitForStore();
		await meanwhile.waitForStore();
		await evicted;
		// One DELETE, enqueued only once t2's apply was stored: lane order lands it after t2's rows.
		expect(events).toEqual(["apply", "apply", `enqueue ${keyOf("cus_1")}`]);
		expect(
			writer.readFreshestState({ identity: identityOf("cus_1") }),
		).toBeNull();
	});

	test("a drop for space enqueues nothing: the rows Postgres holds are still true", async () => {
		const { writer, events, adopt } = createWriter({ subjectMapMaxBytes: 1 });
		adopt("cus_1");
		adopt("cus_2");

		expect(
			writer.readFreshestState({ identity: identityOf("cus_1") }),
		).toBeNull();
		expect(events).toEqual([]);
	});

	test("an evict of a customer with nothing resident still enqueues: its rows may have outlived a drop for space", async () => {
		const { writer, events } = createWriter();

		await writer.evict({ customerKey: keyOf("cus_1") });

		expect(events).toEqual([`enqueue ${keyOf("cus_1")}`]);
	});

	test("a store without evict deletes drops the rows and owes nothing", async () => {
		const { events, track, adopt } = createWriter();
		adopt("cus_1");
		await track({ customerId: "cus_1", commandId: "t1" }).waitForStore();
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
		bare.adopt({
			state: createState({ identity: identityOf("cus_1"), balance: 1 }),
		});
		await bare.evict({ customerKey: keyOf("cus_1") });
		expect(
			bare.readFreshestState({ identity: identityOf("cus_1") }),
		).toBeNull();
		expect(events).toEqual(["apply"]);
	});
});

/** A writer over the real committer store; a DELETE never returns until `deleteGate` resolves. */
const createWriterOverStore = () => {
	const deleteGate = Promise.withResolvers<void>();
	let flushes = 0;
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			flushes += 1;
			if ((request.snapshots?.deletes.length ?? 0) > 0)
				await deleteGate.promise;
			return { applied: request.changes.map(() => true) };
		},
	};
	const subjectSnapshotsConfig = createSubjectSnapshotsStore({ mode: "write" });
	const stateStore = createCommitterStateStore({
		ctx: {
			committer: createCommitter({
				ctx: { db, subjectSnapshotsConfig },
				config: {
					concurrency: 4,
					maxRowsPerFlush: 500,
					retry: {
						degradedAfterAttempts: 1,
						initialBackoffMs: 1,
						maxBackoffMs: 1,
					},
					snapshots: { partitionCount: 64 },
				},
			}),
			db,
			subjectSnapshotsConfig,
		},
	});
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
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 10,
			},
		},
	});
	return { writer, stateStore, deleteGate, flushes: () => flushes };
};

const percentile = ({
	samples,
	fraction,
}: {
	samples: number[];
	fraction: number;
}) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ??
		0
	);
};

describe("evicts never touch the hot path", () => {
	test("with a DELETE held open indefinitely, checks on other customers and on the evicted one keep answering from memory at memory latency", async () => {
		const { writer, stateStore, deleteGate, flushes } = createWriterOverStore();
		await stateStore.initializePartition({ topic, partition, nextOffset: 0n });
		const others = Array.from(
			{ length: 200 },
			(_, index) => `cus_other_${index}`,
		);
		for (const customerId of [...others, "cus_evicted"])
			writer.adopt({
				state: createState({ identity: identityOf(customerId), balance: 100 }),
				baselineAt: 1,
			});

		await writer.evict({ customerKey: keyOf("cus_evicted") });
		await Bun.sleep(5);
		expect(flushes()).toBe(1);

		// The evicted customer reloads (a full read, stood in by adopt) and answers; nobody waits on the lane.
		expect(
			writer.readFreshestState({ identity: identityOf("cus_evicted") }),
		).toBeNull();
		writer.adopt({
			state: createState({ identity: identityOf("cus_evicted"), balance: 50 }),
			baselineAt: 2,
		});
		const samples: number[] = [];
		for (let round = 0; round < 10; round++)
			for (const customerId of [...others, "cus_evicted"]) {
				const startedAt = performance.now();
				const state = writer.readFreshestState({
					identity: identityOf(customerId),
				});
				samples.push(performance.now() - startedAt);
				expect(state).not.toBeNull();
			}
		expect(percentile({ samples, fraction: 0.99 })).toBeLessThan(1);

		// A track on another customer is answered once the log holds it; only its store waits behind the held DELETE.
		const command = createTrackCommand({
			identity: identityOf("cus_other_0"),
			value: 1,
			commandId: "t1",
		});
		const tracked = writer.decide({
			command,
			mutate: ({ state }) => decideTrack({ state, command }),
		});
		await tracked.waitForCommit();
		let stored = false;
		void tracked.waitForStore().then(() => {
			stored = true;
		});
		await Bun.sleep(5);
		expect(stored).toBe(false);
		expect(flushes()).toBe(1);

		deleteGate.resolve();
		await tracked.waitForStore();
		expect(stored).toBe(true);
		expect(flushes()).toBe(2);
		stateStore.close();
	});
});
