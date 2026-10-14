import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { DEFAULT_MAX_BATCHES_PER_FLUSH } from "../../../../src/processor/writer/pendingMutations.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { MutationDurability } from "../../../../src/processor/writer/types/mutation.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../../fixtures/mutations.js";

const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const HELD_LINGER_MS = 60_000;

const settle = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
};

const createLingeringWriter = ({
	applyLingerMs = HELD_LINGER_MS,
	dbControlLingerMs = null,
	dbControlMaxBatchesPerFlush = null,
}: {
	applyLingerMs?: number;
	dbControlLingerMs?: number | null;
	dbControlMaxBatchesPerFlush?: number | null;
} = {}) => {
	const applied: string[][] = [];
	const control = { maxBatchesPerFlush: dbControlMaxBatchesPerFlush };
	let applyGate: Promise<void> | null = null;
	const holdNextApply = () => {
		let release = () => {};
		applyGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		return release;
	};
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			applied.push(records.map((record) => record.mutation.id));
			const gate = applyGate;
			applyGate = null;
			if (gate) await gate;
			return records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			}));
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
			dbControl: {
				get: () => ({
					balanceCommitter: {
						concurrency: null,
						applyLingerMs: dbControlLingerMs,
						maxBatchesPerFlush: control.maxBatchesPerFlush,
					},
				}),
			},
		},
		config: {
			topic: "writer-linger",
			partition: 0,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
				applyLingerMs,
			},
		},
	});
	writer.adopt({ state: createState({ identity, balance: 1_000 }) });

	const track = ({
		commandId,
		durability,
	}: {
		commandId: string;
		durability?: MutationDurability;
	}) => {
		const command = createTrackCommand({ identity, value: 1, commandId });
		return writer.decide({
			command,
			durability,
			mutate: ({ state }) => {
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
			},
		});
	};

	const commitEach = async (commandIds: string[]) => {
		for (const commandId of commandIds) {
			await track({ commandId }).waitForCommit();
			await settle();
		}
	};

	return { writer, applied, track, commitEach, control, holdNextApply };
};

describe("apply linger", () => {
	test("commits inside the linger land as one apply, once a store waiter asks for them", async () => {
		const { writer, applied, commitEach } = createLingeringWriter();
		await commitEach(["t1", "t2", "t3"]);
		expect(applied).toEqual([]);

		await writer.waitForStore();
		expect(applied).toEqual([["t1", "t2", "t3"]]);
	});

	test("with nobody waiting, the linger ends on its own", async () => {
		const { applied, commitEach } = createLingeringWriter({
			applyLingerMs: 20,
		});
		await commitEach(["t1", "t2"]);
		expect(applied).toEqual([]);

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(applied).toEqual([["t1", "t2"]]);
	});

	test("DB control's applyLingerMs overrides the boot value: 0 applies each commit at once", async () => {
		const { applied, commitEach } = createLingeringWriter({
			dbControlLingerMs: 0,
		});
		await commitEach(["t1", "t2"]);

		expect(applied).toEqual([["t1"], ["t2"]]);
	});

	test("a store-durable write is stored without waiting out the linger", async () => {
		const { applied, commitEach, track } = createLingeringWriter();
		await commitEach(["t1"]);

		await track({ commandId: "t2", durability: "store" }).waitForCommit();
		expect(applied).toEqual([["t1", "t2"]]);
	});

	test("an evict lands the writes it waits for at once", async () => {
		const { writer, applied, commitEach } = createLingeringWriter();
		await commitEach(["t1"]);

		await writer.evict({
			customerKey: meteringIdentityToPartitionKey({ identity }),
		});
		expect(applied).toEqual([["t1"]]);
	});

	test("a draining partition is never held by the linger", async () => {
		const { writer, applied, commitEach } = createLingeringWriter();
		await commitEach(["t1", "t2"]);

		await writer.waitForApplies();
		expect(applied).toEqual([["t1", "t2"]]);
	});

	test("a full flush's worth of batches goes without a waiter", async () => {
		const { applied, commitEach } = createLingeringWriter();
		const commandIds = Array.from(
			{ length: DEFAULT_MAX_BATCHES_PER_FLUSH },
			(_, index) => `t${index}`,
		);
		await commitEach(commandIds);
		await settle();

		expect(applied).toEqual([commandIds]);
	});

	test("DB control's maxBatchesPerFlush makes a smaller queue due without a waiter", async () => {
		const { applied, commitEach } = createLingeringWriter({
			dbControlMaxBatchesPerFlush: 3,
		});
		await commitEach(["t1", "t2"]);
		expect(applied).toEqual([]);

		await commitEach(["t3"]);
		await settle();
		expect(applied).toEqual([["t1", "t2", "t3"]]);
	});

	test("each flush takes at most DB control's live maxBatchesPerFlush", async () => {
		const { writer, applied, commitEach, control } = createLingeringWriter();
		await commitEach(["t1", "t2", "t3", "t4", "t5"]);
		expect(applied).toEqual([]);

		control.maxBatchesPerFlush = 2;
		await writer.waitForStore();
		expect(applied).toEqual([["t1", "t2"], ["t3", "t4"], ["t5"]]);
	});

	test("a live change mid-flush neither drops nor repeats a batch", async () => {
		const { writer, applied, commitEach, control, holdNextApply } =
			createLingeringWriter({ dbControlMaxBatchesPerFlush: 2 });
		const release = holdNextApply();
		await commitEach(["t1", "t2"]);
		expect(applied).toEqual([["t1", "t2"]]);

		await commitEach(["t3", "t4", "t5"]);
		control.maxBatchesPerFlush = 1;
		release();
		await writer.waitForStore();
		expect(applied).toEqual([["t1", "t2"], ["t3"], ["t4"], ["t5"]]);
	});

	test("a reply decision that never waits on the store wakes nothing", async () => {
		const { writer, applied, commitEach } = createLingeringWriter();
		await commitEach(["t1"]);

		writer.decide({
			command: createTrackCommand({ identity, value: 0, commandId: "r1" }),
			mutate: () => ({ kind: "reply" as const, reply: null }),
		});
		await settle();
		expect(applied).toEqual([]);
	});
});
