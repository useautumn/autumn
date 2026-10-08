import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
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

/** Long enough that any apply a test sees was woken, never timed out. */
const HELD_LINGER_MS = 60_000;

/** Lets the commit loop take and append what is queued. */
const settle = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
};

/** A writer whose store records each apply call's command ids, over an appender that commits at once. */
const createLingeringWriter = ({
	applyLingerMs = HELD_LINGER_MS,
}: {
	applyLingerMs?: number;
} = {}) => {
	const applied: string[][] = [];
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			applied.push(records.map((record) => record.mutation.id));
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

	/** One Kafka commit per track, so each lands in its own batch. */
	const commitEach = async (commandIds: string[]) => {
		for (const commandId of commandIds) {
			await track({ commandId }).waitForCommit();
			await settle();
		}
	};

	return { writer, applied, track, commitEach };
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
		const commandIds = Array.from({ length: 16 }, (_, index) => `t${index}`);
		await commitEach(commandIds);
		await settle();

		expect(applied).toEqual([commandIds]);
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
