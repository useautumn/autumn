import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanRequest,
	applyMutation,
	computeTrack,
	type EvictCommand,
} from "@autumn/balance-engine";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { SubjectStaleError } from "../../../src/processor/subject/subjectErrors.js";
import { createPartitionWriter } from "../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	createState,
	createSubjectFor,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
} from "../../fixtures/mutations.js";

const topic = "subject-drop-reasons";
const partition = 0;
const receiptPolicy = { retentionMs: 86_400_000, now: () => testOccurredAt };
const writerLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 100,
	maxPendingCommandsPerCustomer: 100,
};

const createProcessor = async () => {
	const committer: Committer = {
		apply: async ({ records, expectedOffset }) => ({
			nextOffset: (records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
		}),
		drain: async () => undefined,
		stop: () => undefined,
	};
	const stateStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await stateStore.initializePartition({ topic, partition, nextOffset: 0n });
	let appended = 0n;
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache: createTestCatalogCache(),
			db: createSyntheticWorkerDb(),
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = appended;
					appended += BigInt(outcomes.length);
					return { baseOffset };
				},
				settleCommandOffset: () => undefined,
			},
			receiptPolicy,
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: { topic, partition, writerLimits },
	});
	await processor.initialize({ request: createInitializeRequest() });
	await processor.drain();
	return processor;
};

const evictCommand: EvictCommand = {
	schemaVersion: 1,
	type: "evict",
	requestId: "req_evict",
	identity: testIdentity,
	occurredAt: testOccurredAt,
};

const planDeletingAGrantTheWorkerLacks: ApplyBillingPlanRequest = {
	command: {
		schemaVersion: 1,
		type: "applyBillingPlan",
		requestId: "req_plan",
		commandId: "plan_1",
		identity: testIdentity,
		occurredAt: testOccurredAt,
		entityIds: [],
		ops: [
			{ op: "delete", table: "customerEntitlements", id: "grant_not_held" },
		],
		expiringPooledBalanceIds: [],
	},
	catalogRows: [],
};

describe("subject drop reasons", () => {
	test("an evict command counts the customer's resident subject as evict", async () => {
		const processor = await createProcessor();
		expect(processor.readSubjectMapUsage().residentSubjects).toBe(1);

		await processor.evict({ command: evictCommand });

		expect(processor.readSubjectMapUsage()).toMatchObject({
			residentSubjects: 0,
			residentBytes: 0,
			droppedSubjects: { evict: 1, stale: 0, capacity: 0 },
		});
	});

	test("a billing plan that finds the worker's copy behind Postgres drops it as stale", async () => {
		const processor = await createProcessor();

		await expect(
			processor.applyBillingPlan({ request: planDeletingAGrantTheWorkerLacks }),
		).rejects.toBeInstanceOf(SubjectStaleError);

		expect(processor.readSubjectMapUsage()).toMatchObject({
			residentSubjects: 0,
			droppedSubjects: { stale: 1, evict: 0, capacity: 0 },
		});
	});

	test("the store refusing a write drops the customer's projection as storeRejected", async () => {
		const writer = createPartitionWriter({
			ctx: {
				stateStore: {
					baseline: "map",
					readState: () => null,
					readOwnState: () => null,
					readReceipt: () => null,
					applyDurableMutations: async ({ records }) =>
						records.map((record) => ({
							kind: "rejected" as const,
							mutation: record.mutation,
							cause: new Error("row refused"),
						})),
				},
				appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
				receiptPolicy,
				recentCommands: createRecentCommands({
					windowMs: 600_000,
					now: () => 0,
				}),
			},
			config: { topic, partition, limits: writerLimits },
		});
		const initial = createState();
		const command = createTrackCommand({ identity: testIdentity });
		const decided = writer.decide({
			command,
			durability: "store",
			mutate: () => {
				const mutation = computeTrack({
					fullSubject: createSubjectFor({ state: initial, entityId: null }),
					command,
				});
				return {
					kind: "write" as const,
					mutation,
					nextState: applyMutation({ state: initial, mutation }),
				};
			},
		});
		expect(writer.readSubjectMapUsage().residentSubjects).toBe(1);

		await expect(decided.waitForCommit()).rejects.toThrow("row refused");

		expect(writer.readSubjectMapUsage()).toMatchObject({
			residentSubjects: 0,
			droppedSubjects: { storeRejected: 1, evict: 0, capacity: 0 },
		});
	});
});
