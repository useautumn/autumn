import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanRequest,
	type EvictCommand,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type ReadSubjectStateCommand,
} from "@autumn/balance-engine";
import {
	type ColdMigrationBatch,
	type ColdMigrationBatchResult,
	ColdMigrationBatchRolledBackError,
	type SubjectRowsEnvelope,
} from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import type { MigrationLaneItem } from "../../../src/processor/commands/applyMigrationBatch/types/migrationLaneItem.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMap } from "../../../src/processor/writer/subjectMap/createSubjectMap.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
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

const topic = "migration-batch-fence";
const partition = 0;
const receiptPolicy = { retentionMs: 86_400_000, now: () => testOccurredAt };
const writerLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 100,
	maxPendingCommandsPerCustomer: 100,
};

const identityOf = (customerId: string) => ({ ...testIdentity, customerId });

const envelopeOf = (customerId: string): SubjectRowsEnvelope => ({
	customer: {
		internal_id: `${customerId}_internal`,
		id: customerId,
		org_id: testIdentity.orgId,
		env: AppEnv.Sandbox,
		created_at: testOccurredAt,
		processor: null,
		metadata: null,
		send_email_receipts: false,
		config: null,
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
		usage_alerts: null,
	},
	customer_products: [],
	customer_prices: [],
	customer_entitlements: [],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: null,
});

type ColdApply = NonNullable<WorkerDb["applyColdMigrationBatch"]>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const createLaneProcessor = async ({
	coldApply,
	readRows,
}: {
	coldApply: ColdApply;
	readRows?: (customerId: string) => Promise<SubjectRowsEnvelope | null>;
}) => {
	const events: string[] = [];
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
	const db: WorkerDb = {
		...createSyntheticWorkerDb(),
		getSubjectRows: async ({ identity }) => {
			events.push(`read:${identity.customerId}`);
			return readRows
				? readRows(identity.customerId)
				: envelopeOf(identity.customerId);
		},
		applyColdMigrationBatch: async (params) => {
			events.push(
				`cold:${params.batch.customers.map((customer) => customer.customerId).join(",")}`,
			);
			const result = await coldApply(params);
			events.push("cold:settled");
			return result;
		},
		markMigrationItemRunsSucceeded: async ({ runs }) => runs.length,
	};
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
				readClaimToken: () => "claim_1",
			},
			catalogCache: createTestCatalogCache(),
			db,
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
	return { processor, events };
};

const deleteGrantItem = ({
	customerId,
}: {
	customerId: string;
}): MigrationLaneItem => {
	const request: ApplyBillingPlanRequest = {
		command: {
			schemaVersion: 1,
			type: "applyBillingPlan",
			requestId: `req_${customerId}`,
			commandId: `mig_${customerId}`,
			identity: identityOf(customerId),
			occurredAt: testOccurredAt,
			entityIds: [],
			ops: [
				{
					op: "delete",
					table: "customerEntitlements",
					id: `ce_${customerId}`,
					expect: { entitlement_id: "ent_messages" },
					withoutRollovers: true,
				},
			],
			expiringPooledBalanceIds: [],
		},
		catalogRows: [],
	};
	return {
		request,
		migrationInternalId: "mig_internal",
		migrationRunId: "run_1",
		internalCustomerId: `${customerId}_internal`,
		producedAt: testOccurredAt,
	};
};

const evictCommandOf = (customerId: string): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: `evict_${customerId}`,
	identity: identityOf(customerId),
	occurredAt: testOccurredAt,
});

const readStateCommand = (customerId: string): ReadSubjectStateCommand => ({
	schemaVersion: 1,
	type: "readSubjectState",
	requestId: `read_${customerId}`,
	identity: identityOf(customerId),
	occurredAt: testOccurredAt,
	org: testOrg,
});

const appliedResult = ({
	batch,
}: {
	batch: ColdMigrationBatch;
}): ColdMigrationBatchResult => ({
	applied: batch.customers.map((customer) => customer.internalCustomerId),
	stale: [],
	settled: [],
	deleted: batch.customers.length,
	updated: 0,
	snapshotsDeleted: 0,
	runsMarked: batch.customers.length,
});

const gate = () => {
	const { promise, resolve } = Promise.withResolvers<void>();
	return { promise, open: resolve };
};

describe("migration batch fence", () => {
	test("a cold customer is fenced, written once, and its load reads only after the write settles", async () => {
		const commit = gate();
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => {
				await commit.promise;
				return appliedResult({ batch });
			},
		});
		const batch = processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_cold" })],
		});
		await tick();
		const read = processor.readSubjectState({
			command: readStateCommand("cus_cold"),
		});
		await tick();
		expect(events).toEqual(["cold:cus_cold"]);

		commit.open();
		const outcome = await batch;
		expect(outcome).toMatchObject({ cold: 1, resident: 0, coldApplied: 1 });
		await read;

		expect(events).toEqual(["cold:cus_cold", "cold:settled", "read:cus_cold"]);
	});

	test("a resident customer takes the in-memory path and is never written cold", async () => {
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => appliedResult({ batch }),
		});

		const outcome = await processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: testIdentity.customerId })],
		});

		expect(outcome).toMatchObject({ cold: 0, resident: 1, residentStale: 1 });
		expect(events.filter((event) => event.startsWith("cold:"))).toEqual([]);
	});

	test("a customer whose load is still reading Postgres is not cold", async () => {
		const rows = gate();
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => appliedResult({ batch }),
			readRows: async (customerId) => {
				await rows.promise;
				return envelopeOf(customerId);
			},
		});

		const read = processor.readSubjectState({
			command: readStateCommand("cus_loading"),
		});
		await tick();
		const batch = processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_loading" })],
		});
		await tick();
		rows.open();
		await read;
		const outcome = await batch;

		expect(outcome).toMatchObject({ cold: 0, resident: 1 });
		expect(events.filter((event) => event.startsWith("cold:"))).toEqual([]);
	});

	test("an unrelated customer's load does not wait on another customer's fence", async () => {
		const commit = gate();
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => {
				await commit.promise;
				return appliedResult({ batch });
			},
		});

		const batch = processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_cold" })],
		});
		await tick();
		await processor.readSubjectState({
			command: readStateCommand("cus_other"),
		});

		expect(events).toEqual(["cold:cus_cold", "read:cus_other"]);
		commit.open();
		await batch;
	});

	test("a rolled-back cold batch releases its fence and leaves the customer unwritten, cold and retryable", async () => {
		let rollsBack = true;
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => {
				if (!rollsBack) return appliedResult({ batch });
				rollsBack = false;
				throw new ColdMigrationBatchRolledBackError({
					reason: "forced",
					cause: new Error("forced"),
				});
			},
		});

		const outcome = await processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_cold" })],
		});
		expect(outcome).toMatchObject({ cold: 1, coldApplied: 0, coldFailed: 1 });

		await processor.readSubjectState({ command: readStateCommand("cus_cold") });
		expect(events).toEqual(["cold:cus_cold", "read:cus_cold"]);

		await processor.evict({ command: evictCommandOf("cus_cold") });
		const retried = await processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_cold" })],
		});
		expect(retried).toMatchObject({ cold: 1, coldApplied: 1, coldFailed: 0 });
	});

	test("a customer appearing twice in one batch is written cold once", async () => {
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => appliedResult({ batch }),
		});

		const outcome = await processor.applyMigrationBatch?.({
			items: [
				deleteGrantItem({ customerId: "cus_twice" }),
				deleteGrantItem({ customerId: "cus_twice" }),
			],
		});

		expect(outcome).toMatchObject({ cold: 1, resident: 1 });
		expect(events.filter((event) => event === "cold:cus_twice")).toHaveLength(
			1,
		);
	});

	test("an applied cold customer never becomes resident", async () => {
		const { processor } = await createLaneProcessor({
			coldApply: async ({ batch }) => appliedResult({ batch }),
		});
		const before = processor.readSubjectMapUsage();

		const outcome = await processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: "cus_cold" })],
		});

		expect(outcome?.coldApplied).toBe(1);
		expect(processor.readSubjectMapUsage().residentSubjects).toBe(
			before.residentSubjects,
		);
	});
});

describe("subject map residency for the migration fence", () => {
	const customerKey = meteringIdentityToPartitionKey({
		identity: identityOf("cus_hidden"),
	});
	const subjectKey = meteringIdentityToSubjectKey({
		identity: identityOf("cus_hidden"),
	});

	test("a customer hidden by an evict while its write awaits the store is still held", () => {
		const map = createSubjectMap();
		map.pin({ subjectKey });
		map.setState({
			subjectKey,
			customerKey,
			state: createInitializeRequest().state,
		});
		map.evictCustomer({ customerKey, reason: "evict" });

		expect(map.isEvicting({ customerKey })).toBe(true);
		expect(map.holdsCustomer({ customerKey, subjectKey })).toBe(true);

		map.unpin({ subjectKey });
		expect(map.holdsCustomer({ customerKey, subjectKey })).toBe(false);
	});

	test("a pin-only placeholder holds the customer", () => {
		const map = createSubjectMap();
		map.pin({ subjectKey });
		expect(map.holdsCustomer({ customerKey, subjectKey })).toBe(true);
	});
});

describe("evicted then migrated", () => {
	test("a customer evicted before its batch arrives is cold again", async () => {
		const { processor, events } = await createLaneProcessor({
			coldApply: async ({ batch }) => appliedResult({ batch }),
		});
		await processor.evict({ command: evictCommandOf(testIdentity.customerId) });

		const outcome = await processor.applyMigrationBatch?.({
			items: [deleteGrantItem({ customerId: testIdentity.customerId })],
		});

		expect(outcome).toMatchObject({ cold: 1, coldApplied: 1 });
		expect(events).toContain(`cold:${testIdentity.customerId}`);
	});
});
