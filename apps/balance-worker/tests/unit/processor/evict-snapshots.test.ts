import { describe, expect, test } from "bun:test";
import {
	type EvictCommand,
	meteringIdentityToPartitionKey,
	parseCheckCommand,
	partitionKeyToMeteringIdentity,
} from "@autumn/balance-engine";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../fixtures/subjectSnapshotsStore.js";

const topic = "evict-snapshots";
const partition = 0;

const keyOf = (customerId: string) =>
	meteringIdentityToPartitionKey({
		identity: { orgId: "org_1", env: "sandbox", customerId, entityId: null },
	});
const customerIdOf = (customerKey: string) =>
	partitionKeyToMeteringIdentity({ partitionKey: customerKey }).customerId;

const evictOf = ({ customerId }: { customerId: string }): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: `req_${customerId}`,
	identity: { orgId: "org_1", env: "sandbox", customerId, entityId: null },
	occurredAt: 1_700_000_000_000,
});

/** The production processor over the committer's store with evict deletes; DELETEs wait on `deleteGate`. */
const createProcessor = async ({ logsEvicts }: { logsEvicts: boolean }) => {
	const deleted: string[][] = [];
	const deleteGate = { held: Promise.resolve() as Promise<void> };
	const committer: Committer = {
		apply: async ({ records, expectedOffset, snapshotIntent }) => {
			if (records.length === 0 && snapshotIntent) {
				await deleteGate.held;
				deleted.push([...snapshotIntent.keys()]);
				return { nextOffset: expectedOffset };
			}
			return {
				nextOffset:
					(records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
			};
		},
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
			subjectSnapshotsConfig: createSubjectSnapshotsStore({ mode: "write" }),
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
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
				deferredCommitMs: 1,
			},
			logsEvicts,
		},
	});
	return { processor, deleted, deleteGate };
};

describe("evict snapshot deletes", () => {
	test("a check answers while a snapshot DELETE holds the partition lane: an evict never reaches the hot path", async () => {
		const { processor, deleted, deleteGate } = await createProcessor({
			logsEvicts: true,
		});
		await processor.initialize({ request: createInitializeRequest() });
		await processor.drain();
		const held = Promise.withResolvers<void>();
		deleteGate.held = held.promise;
		await processor.evict({ command: evictOf({ customerId: "cus_other" }) });
		await Bun.sleep(2);
		expect(deleted).toEqual([]);
		try {
			const checked = processor.check({
				command: parseCheckCommand({
					input: {
						schemaVersion: 1,
						type: "check",
						org: testOrg,
						requestId: "req_check",
						identity: testIdentity,
						featureId: "messages",
						internalFeatureId: "feat_messages",
						requiredBalance: 1,
						properties: null,
						occurredAt: testOccurredAt,
					},
				}),
			});
			// The DELETE lane is still held, so this await only returns if the check never waits on it.
			expect((await checked).result.allowed).toBe(true);
		} finally {
			held.resolve();
		}
		await Bun.sleep(2);
		expect(deleted).toEqual([[keyOf("cus_other")]]);
	});

	test.each([true, false])(
		"an evict over HTTP answers once the rows are gone from memory; its DELETE lands on the lane behind it (evicts logged: %p)",
		async (logsEvicts) => {
			const { processor, deleted, deleteGate } = await createProcessor({
				logsEvicts,
			});
			const held = Promise.withResolvers<void>();
			deleteGate.held = held.promise;

			await processor.evict({ command: evictOf({ customerId: "cus_1" }) });
			await Bun.sleep(2);
			expect(deleted).toEqual([]);

			held.resolve();
			await Bun.sleep(2);
			expect(deleted).toEqual([[keyOf("cus_1")]]);
		},
	);

	test("queued evicts never wait on the lane, and the ones behind an in-flight DELETE share the next", async () => {
		const { processor, deleted, deleteGate } = await createProcessor({
			logsEvicts: true,
		});
		const held = Promise.withResolvers<void>();
		deleteGate.held = held.promise;
		const deferredLogs: Promise<void>[] = [];

		for (const [index, customerId] of ["cus_1", "cus_2", "cus_3"].entries()) {
			await processor.execute({
				source: { commandOffset: String(index) },
				deferredLogs: { add: (log) => deferredLogs.push(log) },
				run: (scope) => scope.evict({ command: evictOf({ customerId }) }),
			});
			await Bun.sleep(1);
		}
		expect(deleted).toEqual([]);

		held.resolve();
		await Promise.all(deferredLogs);
		await Bun.sleep(5);
		// The first DELETE was already in flight; the two queued behind it went together.
		expect(deleted.map((batch) => batch.map(customerIdOf))).toEqual([
			["cus_1"],
			["cus_2", "cus_3"],
		]);
	});
});
