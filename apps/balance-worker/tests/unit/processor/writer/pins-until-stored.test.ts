import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { SubjectSnapshotMode } from "@autumn/edge-config";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMapBudget } from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import type { MutateParams } from "../../../../src/processor/writer/types/mutation.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import type { DurableMutationRecord } from "../../../../src/state/types/durableMutation.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../../fixtures/subjectSnapshotsStore.js";

const topic = "writer-pins";
const partition = 2;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const other: MeteringIdentity = { ...identity, customerId: "cus_other" };

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

/** A writer over a store with nothing resident and a map so small that reading one more subject evicts the last unpinned one. */
const createWriter = ({
	mode = "write",
}: {
	mode?: SubjectSnapshotMode;
} = {}) => {
	const applied: DurableMutationRecord[] = [];
	const applyGate = { held: Promise.resolve() as Promise<void> };
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			await applyGate.held;
			applied.push(...records);
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
			subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode }),
		},
		config: {
			topic,
			partition,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 10,
				subjectMapBudget: createSubjectMapBudget({ totalBytes: 1 }),
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
	return { writer, applied, applyGate, track };
};

describe("a subject's rows stay resident until the store holds its record", () => {
	for (const mode of ["write", "off"] as const)
		test(`snapshots ${mode}: appended but not yet stored, the subject survives a read that would otherwise evict it for space; once stored, it goes`, async () => {
			const { writer, applyGate, track } = createWriter({ mode });
			writer.adopt({ state: createState({ identity, balance: 100 }) });
			const held = Promise.withResolvers<void>();
			applyGate.held = held.promise;

			const tracked = track("t1");
			await tracked.waitForCommit();
			writer.adopt({ state: createState({ identity: other, balance: 1 }) });
			expect(writer.readFreshestState({ identity })).not.toBeNull();

			held.resolve();
			await tracked.waitForStore();
			writer.adopt({
				state: createState({
					identity: { ...identity, customerId: "cus_third" },
					balance: 1,
				}),
			});
			expect(writer.readFreshestState({ identity })).toBeNull();
		});

	test("a command arriving while the record is unapplied decides on the resident rows, never on a read of rows Postgres lacks", async () => {
		const { writer, applyGate, track } = createWriter({ mode: "off" });
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		const first = track("t1");
		await first.waitForCommit();
		writer.adopt({ state: createState({ identity: other, balance: 1 }) });

		// What a cold load would see now: Postgres without t1. It only happens if the rows were dropped.
		if (!writer.readFreshestState({ identity }))
			writer.adopt({ state: createState({ identity, balance: 100 }) });
		const second = track("t2");
		held.resolve();
		await second.waitForStore();

		expect(
			writer.readFreshestState({ identity })?.customerEntitlements[0]?.balance,
		).toBe(98);
	});
});
