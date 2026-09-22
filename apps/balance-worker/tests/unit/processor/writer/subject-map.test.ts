import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createSubjectMap } from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import type { DurableMutationRecord } from "../../../../src/state/types/durableMutation.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	testIdentity,
} from "../../../fixtures/mutations.js";

const topic = "autumn-metering";
const partition = 0;
const customerKey = meteringIdentityToPartitionKey({ identity: testIdentity });

describe("createSubjectMap", () => {
	test("evicts one customer's subjects, entities included, and keeps its command ids", () => {
		const map = createSubjectMap();
		const state = createState();
		const entityKey = `${customerKey}:entity_1`;
		map.setState({ subjectKey: customerKey, state });
		map.setState({ subjectKey: entityKey, state });
		map.setState({ subjectKey: "other", state });
		map.rememberCommand({
			customerKey,
			commandId: "cmd",
			fingerprint: "fp",
			expiresAt: 10,
		});

		map.evictCustomer({ customerKey });
		expect(map.readState({ subjectKey: customerKey })).toBeNull();
		expect(map.readState({ subjectKey: entityKey })).toBeNull();
		expect(map.readState({ subjectKey: "other" })).toEqual(state);
		expect(
			map.readCommand({ customerKey, commandId: "cmd", now: 0 }),
		).not.toBeNull();
	});

	test("a pinned subject stays until its last pin is released, then goes", () => {
		const map = createSubjectMap();
		const state = createState();
		map.setState({ subjectKey: customerKey, state });
		map.pin({ subjectKey: customerKey });
		map.pin({ subjectKey: customerKey });
		map.evictCustomer({ customerKey });
		expect(map.readState({ subjectKey: customerKey })).toEqual(state);
		map.unpin({ subjectKey: customerKey });
		expect(map.readState({ subjectKey: customerKey })).toEqual(state);
		map.unpin({ subjectKey: customerKey });
		expect(map.readState({ subjectKey: customerKey })).toBeNull();
		expect(map.sizeBytes()).toBe(0);
	});

	test("evicts the least recently read subject first and never a pinned one", () => {
		const map = createSubjectMap({ maxBytes: 1 });
		const a = createState({ identity: { ...testIdentity, customerId: "a" } });
		const b = createState({ identity: { ...testIdentity, customerId: "b" } });
		const c = createState({ identity: { ...testIdentity, customerId: "c" } });
		map.pin({ subjectKey: "a" });
		map.setState({ subjectKey: "a", state: a });
		map.setState({ subjectKey: "b", state: b });

		// Over the bound, but a is pinned and b was just written: nothing to evict.
		expect(map.readState({ subjectKey: "a" })).toEqual(a);
		expect(map.readState({ subjectKey: "b" })).toEqual(b);
		map.unpin({ subjectKey: "a" });
		map.setState({ subjectKey: "c", state: c });
		expect(map.readState({ subjectKey: "a" })).toBeNull();
		expect(map.readState({ subjectKey: "b" })).toBeNull();
		expect(map.readState({ subjectKey: "c" })).toEqual(c);
	});

	test("remembers a customer's recent commands until they expire", () => {
		const map = createSubjectMap();
		map.rememberCommand({
			customerKey,
			commandId: "cmd_1",
			fingerprint: "fp",
			expiresAt: 100,
		});
		expect(
			map.readCommand({ customerKey, commandId: "cmd_1", now: 99 }),
		).toEqual({ fingerprint: "fp", expiresAt: 100 });
		expect(
			map.readCommand({ customerKey, commandId: "cmd_1", now: 100 }),
		).toBeNull();
		expect(
			map.readCommand({ customerKey, commandId: "cmd_9", now: 0 }),
		).toBeNull();
	});
});

/** A store with nothing resident, the way the postgres backend answers; apply just records what it saw. */
function createNullStore() {
	const applied: DurableMutationRecord[] = [];
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			applied.push(...records);
			return records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			}));
		},
	};
	return { stateStore, applied };
}

function createWriterOverNullStore() {
	const store = createNullStore();
	let nextOffset = 0n;
	const writer = createPartitionWriter({
		ctx: {
			stateStore: store.stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
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
	return { writer, store };
}

function trackSubmission({
	command,
	initial,
}: {
	command: TrackCommand;
	initial: SubjectState;
}) {
	return {
		command,
		mutate: ({ state }: { state: SubjectState | null }) => {
			const current = state ?? initial;
			const mutation = computeTrack({
				fullSubject: createSubjectFor({ state: current, entityId: null }),
				command,
			});
			return {
				kind: "write" as const,
				mutation,
				nextState: applyMutation({ state: current, mutation }),
			};
		},
	};
}

const balanceOf = (state: SubjectState | null) =>
	state?.customerEntitlements[0]?.balance;

describe("writer over a store with no resident state", () => {
	test("the map keeps the committed rows, so the next track starts from them", async () => {
		const { writer } = createWriterOverNullStore();
		const initial = createState({ balance: 100 });

		const first = writer.decide(
			trackSubmission({
				command: createTrackCommand({
					identity: testIdentity,
					commandId: "cmd_1",
					value: 5,
				}),
				initial,
			}),
		);
		await first.waitForCommit();
		expect(
			balanceOf(writer.readFreshestState({ identity: testIdentity })),
		).toBe(95);

		const second = writer.decide(
			trackSubmission({
				command: createTrackCommand({
					identity: testIdentity,
					commandId: "cmd_2",
					value: 5,
				}),
				initial,
			}),
		);
		await second.waitForCommit();
		expect(
			balanceOf(writer.readFreshestState({ identity: testIdentity })),
		).toBe(90);
	});

	test("a retry after commit is a duplicate, a reused id with other input is a conflict", async () => {
		const { writer, store } = createWriterOverNullStore();
		const initial = createState({ balance: 100 });
		const command = createTrackCommand({
			identity: testIdentity,
			commandId: "cmd_1",
			value: 5,
		});
		await writer.decide(trackSubmission({ command, initial })).waitForCommit();

		expect(() => writer.decide(trackSubmission({ command, initial }))).toThrow(
			"Command already applied: cmd_1",
		);
		expect(() =>
			writer.decide(
				trackSubmission({
					command: createTrackCommand({
						identity: testIdentity,
						commandId: "cmd_1",
						value: 7,
					}),
					initial,
				}),
			),
		).toThrow("Command id reused with different input: cmd_1");
		expect(store.applied).toHaveLength(1);
		expect(
			balanceOf(writer.readFreshestState({ identity: testIdentity })),
		).toBe(95);
	});

	test("a store that lands some records and fails one: every caller keeps the reply Kafka earned, and the writer recovers", async () => {
		const poisonId = "cmd_2";
		const stateStore: PartitionWriterContext["stateStore"] = {
			baseline: "map",
			readState: () => null,
			readOwnState: () => null,
			readReceipt: () => null,
			// Like the committer store: records at and after the one that would not land are failed.
			applyDurableMutations: async ({ records }) => {
				let blocked = false;
				return records.map((record) => {
					blocked ||= record.mutation.id === poisonId;
					return blocked
						? {
								kind: "failed" as const,
								mutation: record.mutation,
								cause: new Error(
									record.mutation.id === poisonId ? "row refused" : "blocked",
								),
							}
						: {
								kind: "applied" as const,
								mutation: record.mutation,
								nextOffset: record.position.offset + 1n,
							};
				});
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
		const initial = createState({ balance: 100 });
		const decided = ["cmd_1", "cmd_2", "cmd_3"].map((commandId) =>
			writer.decide(
				trackSubmission({
					command: createTrackCommand({
						identity: testIdentity,
						commandId,
						value: 5,
					}),
					initial,
				}),
			),
		);

		const settled = await Promise.allSettled(
			decided.map((d) => d.waitForCommit()),
		);
		// All three were answered when Kafka took the batch. The store refusing a row
		// afterwards cannot reach a caller that already holds its reply, so the refusal
		// surfaces as the partition entering recovery instead.
		expect(settled.map((result) => result.status)).toEqual([
			"fulfilled",
			"fulfilled",
			"fulfilled",
		]);
		// cmd_3 landed nowhere: the store never reached it, and recovery rejects what is left.
		expect(() =>
			writer.decide(
				trackSubmission({
					command: createTrackCommand({
						identity: testIdentity,
						commandId: "cmd_4",
						value: 5,
					}),
					initial,
				}),
			),
		).toThrow("Partition writer requires recovery");
	});
});
