import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { commandToFingerprint } from "../../../../src/processor/writer/receipt/commandToFingerprint.js";
import { mutationToRecord } from "../../../../src/processor/writer/receipt/mutationToRecord.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMap } from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import { PartitionWriterRecoveryRequiredError } from "../../../../src/processor/writer/writerErrors.js";
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
	test("evicts one customer's subjects, entities included", () => {
		const map = createSubjectMap();
		const state = createState();
		const entityKey = `${customerKey}:entity_1`;
		map.setState({ subjectKey: customerKey, customerKey, state });
		map.setState({ subjectKey: entityKey, customerKey, state });
		map.setState({ subjectKey: "other", customerKey: "other", state });

		map.evictCustomer({ customerKey });
		expect(map.readState({ subjectKey: customerKey })).toBeNull();
		expect(map.readState({ subjectKey: entityKey })).toBeNull();
		expect(map.readState({ subjectKey: "other" })).toEqual(state);
	});

	test("an evict finds the customer's subjects through the index, and an LRU drop leaves the index clean", () => {
		const map = createSubjectMap({ maxBytes: 1 });
		const state = createState();
		const entityKey = `${customerKey}:entity_1`;
		map.setState({ subjectKey: customerKey, customerKey, state });
		// Over the bound: the customer's row is dropped by LRU, the entity's stays as the one just written.
		map.setState({ subjectKey: entityKey, customerKey, state });
		expect(map.readState({ subjectKey: customerKey })).toBeNull();
		expect(map.readState({ subjectKey: entityKey })).toEqual(state);

		map.evictCustomer({ customerKey });
		expect(map.readState({ subjectKey: entityKey })).toBeNull();
		expect(map.sizeBytes()).toBe(0);
		// Nothing left for the customer: a second evict is a no-op, not an error.
		map.evictCustomer({ customerKey });
	});

	test("a pinned subject stays until its last pin is released, then goes", () => {
		const map = createSubjectMap();
		const state = createState();
		map.setState({ subjectKey: customerKey, customerKey, state });
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
		map.setState({ subjectKey: "a", customerKey: "a", state: a });
		map.setState({ subjectKey: "b", customerKey: "b", state: b });

		// Over the bound, but a is pinned and b was just written: nothing to evict.
		expect(map.readState({ subjectKey: "a" })).toEqual(a);
		expect(map.readState({ subjectKey: "b" })).toEqual(b);
		map.unpin({ subjectKey: "a" });
		map.setState({ subjectKey: "c", customerKey: "c", state: c });
		expect(map.readState({ subjectKey: "a" })).toBeNull();
		expect(map.readState({ subjectKey: "b" })).toBeNull();
		expect(map.readState({ subjectKey: "c" })).toEqual(c);
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
	const recentCommands = createRecentCommands({
		windowMs: 600_000,
		now: () => 0,
	});
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
			recentCommands,
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
	return { writer, store, recentCommands };
}

function trackSubmission({
	command,
	initial,
	durability,
}: {
	command: TrackCommand;
	initial: SubjectState;
	durability?: "log" | "store";
}) {
	return {
		command,
		durability,
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

	test("a busy customer's early commands still dedupe: the memory is per partition, not 32 per customer", async () => {
		const { writer, store } = createWriterOverNullStore();
		const initial = createState({ balance: 1_000 });
		const commandCount = 40;
		for (let index = 0; index < commandCount; index++) {
			await writer
				.decide(
					trackSubmission({
						command: createTrackCommand({
							identity: testIdentity,
							commandId: `cmd_${index}`,
							value: 1,
						}),
						initial,
					}),
				)
				.waitForCommit();
		}

		expect(() =>
			writer.decide(
				trackSubmission({
					command: createTrackCommand({
						identity: testIdentity,
						commandId: "cmd_0",
						value: 1,
					}),
					initial,
				}),
			),
		).toThrow("Command already applied: cmd_0");
		expect(store.applied).toHaveLength(commandCount);
	});

	test("a record remembered from the log is a duplicate on retry, without this writer having decided it", () => {
		const { writer, store, recentCommands } = createWriterOverNullStore();
		const initial = createState({ balance: 100 });
		const command = createTrackCommand({
			identity: testIdentity,
			commandId: "cmd_1",
			value: 5,
		});
		const decided = trackSubmission({ command, initial }).mutate({
			state: null,
		});
		if (decided.kind !== "write") throw new Error("Expected a mutation");
		recentCommands.remember({
			mutation: mutationToRecord({
				mutation: decided.mutation,
				fingerprint: commandToFingerprint({ command }),
				receiptPolicy: { retentionMs: 60_000, now: () => 0 },
			}),
		});

		expect(() => writer.decide(trackSubmission({ command, initial }))).toThrow(
			"Command already applied: cmd_1",
		);
		expect(store.applied).toHaveLength(0);
	});

	test("evicting the customer's rows keeps its command ids, so a retry after eviction is still a duplicate", async () => {
		const { writer, store } = createWriterOverNullStore();
		const initial = createState({ balance: 100 });
		const command = createTrackCommand({
			identity: testIdentity,
			commandId: "cmd_1",
			value: 5,
		});
		await writer.decide(trackSubmission({ command, initial })).waitForCommit();
		await writer.evict({ customerKey });
		expect(writer.readFreshestState({ identity: testIdentity })).toBeNull();

		expect(() => writer.decide(trackSubmission({ command, initial }))).toThrow(
			"Command already applied: cmd_1",
		);
		expect(store.applied).toHaveLength(1);
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
				recentCommands: createRecentCommands({
					windowMs: 600_000,
					now: () => 0,
				}),
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
		const stored = await Promise.allSettled(
			decided.map((decision) => decision.waitForStore()),
		);
		expect(stored).toEqual(
			decided.map(() => ({
				status: "rejected",
				reason: expect.any(PartitionWriterRecoveryRequiredError),
			})),
		);
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

	/** A command that must not be told a thing landed until it has landed
	 *  everywhere opts in with "store", and then behaves exactly as every write did
	 *  before: it waits for the apply, and a refusal still reaches it. */
	test("a store-durable command waits for the apply and still hears a refusal", async () => {
		let releaseApply: () => void = () => undefined;
		const applyGate = new Promise<void>((resolve) => {
			releaseApply = resolve;
		});
		const applied: DurableMutationRecord[] = [];
		const stateStore: PartitionWriterContext["stateStore"] = {
			baseline: "map",
			readState: () => null,
			readOwnState: () => null,
			readReceipt: () => null,
			applyDurableMutations: async ({ records }) => {
				await applyGate;
				applied.push(...records);
				return records.map((record) => ({
					kind: "rejected" as const,
					mutation: record.mutation,
					cause: new Error("row refused"),
				}));
			},
		};
		const writer = createPartitionWriter({
			ctx: {
				stateStore,
				appender: {
					appendCommitted: async ({ outcomes }) => {
						const baseOffset = 0n;
						void outcomes;
						return { baseOffset };
					},
				},
				receiptPolicy: {
					retentionMs: 86_400_000,
					now: () => 1_700_000_000_000,
				},
				recentCommands: createRecentCommands({
					windowMs: 600_000,
					now: () => 0,
				}),
			},
			config: {
				topic,
				partition,
				limits: {
					maxBatchSize: 10,
					maxPendingCommands: 100,
					maxPendingCommandsPerCustomer: 10,
				},
			},
		});
		const initial = createState({ balance: 100 });
		const decided = writer.decide(
			trackSubmission({
				command: createTrackCommand({
					identity: testIdentity,
					commandId: "cmd_store",
					value: 5,
				}),
				initial,
				durability: "store",
			}),
		);

		let settledEarly = false;
		const waited = decided.waitForCommit().then(
			function onSettle() {
				settledEarly = true;
			},
			function onReject() {
				settledEarly = true;
			},
		);
		await Promise.resolve();
		expect(settledEarly).toBe(false);

		releaseApply();
		await waited;
		expect(applied.length).toBe(1);
		await expect(decided.waitForCommit()).rejects.toThrow("row refused");
		await expect(decided.waitForStore()).resolves.toBeUndefined();
	});
});
