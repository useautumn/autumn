import { describe, expect, test } from "bun:test";
import { type EvictCommand, parseCheckCommand } from "@autumn/balance-engine";
import type { SubjectSnapshotCustomer } from "@autumn/postgres";
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

const evictOf = ({ customerId }: { customerId: string }): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: `req_${customerId}`,
	identity: { orgId: "org_1", env: "sandbox", customerId, entityId: null },
	occurredAt: 1_700_000_000_000,
});

/** The production processor over the committer's store with snapshots written; DELETEs wait on `dropGate`. */
const createProcessor = async ({ logsEvicts }: { logsEvicts: boolean }) => {
	const subjectSnapshots = createSubjectSnapshotsStore({ mode: "write" });
	const drops: SubjectSnapshotCustomer[][] = [];
	const dropGate = { held: Promise.resolve() as Promise<void> };
	const committer: Committer = {
		apply: async ({ records, expectedOffset, snapshotDrops }) => {
			if (snapshotDrops) {
				await dropGate.held;
				drops.push([...snapshotDrops]);
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
			subjectSnapshots,
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
			subjectSnapshots,
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
	return { processor, drops, dropGate };
};

/** Only ever asserted false: a settled operation is proven by awaiting it, never by a deadline. */
const settledWithin = async ({
	operation,
	ms,
}: {
	operation: Promise<unknown>;
	ms: number;
}): Promise<boolean> =>
	Promise.race([operation.then(() => true), Bun.sleep(ms).then(() => false)]);

describe("evict snapshot drops", () => {
	test("a warm check answers while another customer's snapshot DELETE holds the partition lane", async () => {
		const { processor, dropGate } = await createProcessor({ logsEvicts: true });
		await processor.initialize({ request: createInitializeRequest() });
		await processor.drain();
		const held = Promise.withResolvers<void>();
		dropGate.held = held.promise;
		const evicted = processor.evict({
			command: evictOf({ customerId: "cus_other" }),
		});
		try {
			expect(await settledWithin({ operation: evicted, ms: 10 })).toBe(false);
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
			await evicted;
		}
	});

	test.each([true, false])(
		"an evict over HTTP answers only after its customer's snapshot DELETE commits (evicts logged: %p)",
		async (logsEvicts) => {
			const { processor, drops, dropGate } = await createProcessor({
				logsEvicts,
			});
			const held = Promise.withResolvers<void>();
			dropGate.held = held.promise;

			const evicted = processor.evict({
				command: evictOf({ customerId: "cus_1" }),
			});

			expect(await settledWithin({ operation: evicted, ms: 50 })).toBe(false);
			held.resolve();
			await evicted;
			expect(drops).toEqual([
				[{ orgId: "org_1", env: "sandbox", customerId: "cus_1" }],
			]);
		},
	);

	test("a queued evict hands its DELETE to the batch instead of waiting for it, so evicts behind it share the next DELETE", async () => {
		const { processor, drops, dropGate } = await createProcessor({
			logsEvicts: true,
		});
		const held = Promise.withResolvers<void>();
		dropGate.held = held.promise;
		const deferredLogs: Promise<void>[] = [];

		for (const [index, customerId] of ["cus_1", "cus_2", "cus_3"].entries()) {
			const queued = processor.execute({
				source: { commandOffset: String(index) },
				deferredLogs,
				run: (scope) => scope.evict({ command: evictOf({ customerId }) }),
			});
			// The DELETE lane is still held, so this await only returns if the queued evict never waits on it.
			await queued;
		}
		expect(drops).toEqual([]);

		held.resolve();
		await Promise.all(deferredLogs);
		// The first DELETE was already in flight; the two queued behind it went together.
		expect(
			drops.map((batch) => batch.map((customer) => customer.customerId)),
		).toEqual([["cus_1"], ["cus_2", "cus_3"]]);
	});
});
