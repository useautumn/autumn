import { describe, expect, spyOn, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	createEntityState,
	entity,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { decideSnapshotIntent } from "../../../../src/processor/writer/actions/decideSnapshotIntent.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMap } from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import type { MutateParams } from "../../../../src/processor/writer/types/mutation.js";
import type {
	PartitionWriterContext,
	PartitionWriterScope,
	PendingMutation,
} from "../../../../src/processor/writer/types/partitionWriter.js";
import type { DurableMutationApplyResult } from "../../../../src/state/types/durableMutation.js";
import type { SnapshotIntent } from "../../../../src/state/types/snapshotIntent.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	createTrackMutation,
} from "../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../fixtures/subjectSnapshotsStore.js";

const topic = "writer-intent";
const partition = 2;
const READ_AT = 1_699_000_000_000;
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

/** The writer over a store with nothing resident; the store records the intent handed in with each apply. */
const createWriter = ({
	mode = "write",
	maxBytes,
}: {
	mode?: "off" | "write";
	maxBytes?: number;
} = {}) => {
	const subjectSnapshotsConfig = createSubjectSnapshotsStore({
		mode,
		...(maxBytes !== undefined && { maxBytes }),
	});
	const intents: (SnapshotIntent | undefined)[] = [];
	const applyGate = { held: Promise.resolve() as Promise<void> };
	let rejectNext: string | null = null;
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records, snapshotIntent }) => {
			await applyGate.held;
			intents.push(snapshotIntent);
			return records.map(
				(record): DurableMutationApplyResult =>
					record.mutation.id === rejectNext
						? {
								kind: "rejected",
								mutation: record.mutation,
								cause: new Error("refused"),
							}
						: {
								kind: "applied",
								mutation: record.mutation,
								nextOffset: record.position.offset + 1n,
							},
			);
		},
	};
	let nextOffset = 0n;
	const writer = createPartitionWriter({
		ctx: {
			stateStore,
			subjectSnapshotsConfig,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 60_000, now: () => READ_AT },
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
	const track = (
		commandId: string,
		who: MeteringIdentity = identity,
		featureId = "messages",
	) => {
		const command = createTrackCommand({
			identity: who,
			value: 1,
			commandId,
			featureId,
		});
		return writer.decide({
			command,
			mutate: ({ state }) => decideTrack({ state, command }),
		});
	};
	const readWhole = ({
		who = identity,
		baselineAt = READ_AT,
		balance = 100,
	}: {
		who?: MeteringIdentity;
		baselineAt?: number;
		balance?: number;
	} = {}) =>
		writer.adopt({
			state: createState({ identity: who, balance }),
			baselineAt,
		});
	return {
		writer,
		intents,
		applyGate,
		track,
		readWhole,
		rejectCommand: (id: string) => {
			rejectNext = id;
		},
		setMode: (next: "off" | "write") => {
			subjectSnapshotsConfig._setRuntimeConfigForTesting({
				...subjectSnapshotsConfig.get(),
				mode: next,
			});
		},
	};
};

const balanceOf = (intent: SnapshotIntent | undefined) => {
	const entry = intent?.get(customerKey);
	if (!entry || entry === "delete") return entry;
	return entry.states.map((state) => state.customerEntitlements[0]?.balance);
};

describe("the writer's snapshot intent", () => {
	test("with the store reading off, a subject read whole still leaves no intent: the flush carries no customer", async () => {
		const { intents, track, readWhole } = createWriter({ mode: "off" });
		readWhole({ baselineAt: 1_234 });
		await track("t1").waitForStore();

		expect(intents).toHaveLength(1);
		expect(intents[0]?.size).toBe(0);
	});

	test("a flip in the store takes effect at the next flush: off carries nothing, write carries the rows, off again carries nothing", async () => {
		const { intents, track, readWhole, setMode } = createWriter({
			mode: "off",
		});
		readWhole({ baselineAt: 1_234 });
		await track("t1").waitForStore();
		setMode("write");
		await track("t2").waitForStore();
		setMode("off");
		await track("t3").waitForStore();

		expect(intents.map((intent) => intent?.size)).toEqual([0, 1, 0]);
		expect(balanceOf(intents[1])).toEqual([98]);
	});

	test("a record appended while off and stored after the flip to write is written: its subject stayed pinned in between", async () => {
		const { intents, applyGate, track, readWhole, setMode } = createWriter({
			mode: "off",
		});
		readWhole({ baselineAt: 1_234 });
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		await track("t0").waitForCommit();
		// t1 queues behind t0's held apply, so its intent is decided only after the flip.
		const tracked = track("t1");
		await tracked.waitForCommit();
		setMode("write");
		held.resolve();
		await tracked.waitForStore();

		expect(intents.map(balanceOf)).toEqual([undefined, [98]]);
	});

	test("a subject read whole: its record's flush may write the rows it leaves, aged by that read", async () => {
		const { intents, track, readWhole } = createWriter();
		readWhole({ baselineAt: 1_234 });
		await track("t1").waitForStore();

		const entry = intents[0]?.get(customerKey);
		expect(entry).not.toBe("delete");
		if (!entry || entry === "delete") throw new Error("expected states");
		expect(entry.baselineAt).toBe(1_234);
		expect(entry.states.map((s) => s.customerEntitlements[0]?.balance)).toEqual(
			[99],
		);
	});

	test("a subject never read whole cannot be vouched for: the customer is deleted instead", async () => {
		const { writer, intents, track } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		await track("t1").waitForStore();
		expect(balanceOf(intents[0])).toBe("delete");
	});

	test("two records of one subject in a batch leave one state, the last; the baseline is the full read's, not the flush's", async () => {
		const { intents, applyGate, track, readWhole } = createWriter();
		readWhole({ baselineAt: 1_234 });
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		const first = track("t1");
		const second = track("t2");
		held.resolve();
		await Promise.all([first.waitForStore(), second.waitForStore()]);

		const flushed = intents.filter((intent) => intent?.has(customerKey));
		const states = flushed.flatMap((intent) => balanceOf(intent) as number[]);
		expect(states.at(-1)).toBe(98);
		expect(
			flushed.every((intent) => intent?.get(customerKey) !== "delete"),
		).toBe(true);
	});

	test("a customer and its entity are two rows of one entry; its baseline is the older read", () => {
		const entityIdentity: MeteringIdentity = {
			...identity,
			entityId: entity.id,
		};
		const subjects = createSubjectMap();
		const customerSubject = meteringIdentityToSubjectKey({ identity });
		const entitySubject = meteringIdentityToSubjectKey({
			identity: entityIdentity,
		});
		subjects.setState({
			subjectKey: customerSubject,
			customerKey,
			state: createState({ identity, balance: 100 }),
			baselineAt: 2_000,
		});
		subjects.setState({
			subjectKey: entitySubject,
			customerKey,
			state: createEntityState(),
			baselineAt: 3_000,
		});
		const scope = {
			ctx: {
				subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode: "write" }),
			},
			state: { subjects },
		} as unknown as PartitionWriterScope;
		const pending = {
			customerKey,
			nextState: createEntityState(),
			projectedSubjectKeys: [customerSubject, entitySubject],
			mutation: createTrackMutation({ state: createEntityState(), value: 1 }),
		} as unknown as PendingMutation;

		const entry = decideSnapshotIntent({ scope, batch: [pending] }).get(
			customerKey,
		);
		if (!entry || entry === "delete") throw new Error("expected states");
		expect(entry.states.map((s) => s.identity.entityId).sort()).toEqual(
			[entity.id, null].sort(),
		);
		expect(entry.baselineAt).toBe(2_000);
	});

	test("an evict waits for the pins: a record decided on the rows meanwhile still writes them, the rows drop once it is stored, a new read whole writes again", async () => {
		const { writer, intents, applyGate, track, readWhole } = createWriter();
		readWhole();
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		const before = track("t1");
		await before.waitForCommit();
		const evicted = writer.evict({ customerKey });
		const meanwhile = track("t2");
		await meanwhile.waitForCommit();
		// Still resident: t2 read these rows, so they stay until its flush is stored.
		expect(writer.readFreshestState({ identity })).not.toBeNull();
		held.resolve();
		await before.waitForStore();
		await meanwhile.waitForStore();
		await evicted;
		expect(balanceOf(intents[0])).toEqual([99]);
		expect(balanceOf(intents[1])).toEqual([98]);
		expect(writer.readFreshestState({ identity })).toBeNull();

		readWhole({ balance: 50, baselineAt: 2 });
		await track("t3").waitForStore();
		const entry = intents[2]?.get(customerKey);
		if (!entry || entry === "delete") throw new Error("expected states");
		expect(entry.baselineAt).toBe(2);
	});

	test("a record the store refused evicts the rows: a record decided on them meanwhile still writes, the drop follows its store, the next read whole writes", async () => {
		const { writer, intents, applyGate, track, readWhole, rejectCommand } =
			createWriter();
		readWhole();
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		rejectCommand("t1");
		const first = track("t1");
		await first.waitForCommit();
		const meanwhile = track("t2");
		held.resolve();
		await meanwhile.waitForStore();

		// Written from memory the refusal invalidated; the evict's DELETE follows it on the lane.
		expect(balanceOf(intents[1])).toEqual([98]);
		expect(writer.readFreshestState({ identity })).toBeNull();
		readWhole({ balance: 100, baselineAt: 3 });
		await track("t3").waitForStore();
		expect(balanceOf(intents[2])).toEqual([99]);
	});

	test("a state over the cap is decided from the map's weight: the customer deletes, and nothing of it is serialised", async () => {
		const { intents, readWhole, track } = createWriter({
			maxBytes: 64,
		});
		const resident = readWhole();
		const stringify = spyOn(JSON, "stringify");
		try {
			await track("t1").waitForStore();
			expect(balanceOf(intents[0])).toBe("delete");
			const serialisedState = stringify.mock.calls.some(
				([value]) =>
					value === resident ||
					(value as { customer?: unknown })?.customer === resident.customer,
			);
			expect(serialisedState).toBe(false);
		} finally {
			stringify.mockRestore();
		}
	});

	test("a mutation that inserts the customer's own row cannot be snapshotted by the statement that inserts it", async () => {
		const { writer, intents, readWhole } = createWriter();
		const state = readWhole();
		const inserting = writer.decide({
			command: createTrackCommand({ identity, value: 1, commandId: "ins" }),
			mutate: () => {
				const decided = decideTrack({
					state,
					command: createTrackCommand({ identity, value: 1, commandId: "ins" }),
				});
				decided.mutation.changes = [
					{ table: "customer", op: "insert", row: state.customer },
					...decided.mutation.changes,
				];
				return decided;
			},
		});
		await inserting.waitForStore();
		expect(balanceOf(intents[0])).toBe("delete");
	});
});
