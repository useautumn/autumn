import { describe, expect, test } from "bun:test";
import {
	type EvictCommand,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	parseCheckCommand,
	partitionKeyToMeteringIdentity,
} from "@autumn/balance-engine";
import type { SubjectSnapshotMode } from "@autumn/edge-config";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	createTrackCommand,
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

const evictOf = ({
	customerId,
	refreshSnapshots,
}: {
	customerId: string;
	refreshSnapshots?: boolean;
}): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: `req_${customerId}`,
	identity: { orgId: "org_1", env: "sandbox", customerId, entityId: null },
	occurredAt: 1_700_000_000_000,
	...(refreshSnapshots !== undefined && { refreshSnapshots }),
});

/** The production processor over the committer's store with evict deletes; DELETEs wait on `deleteGate`, record applies on `applyGates`. */
const createProcessor = async ({
	logsEvicts,
	mode = "write",
	db = createSyntheticWorkerDb(),
	rowsOf = () => [],
}: {
	logsEvicts: boolean;
	mode?: SubjectSnapshotMode;
	db?: WorkerDb;
	/** The snapshot rows Postgres holds for a customer, by entity id (null for its own): what its DELETE returns. */
	rowsOf?: (customerId: string) => (string | null)[];
}) => {
	const deleted: string[][] = [];
	/** Subject keys of the rows each refresh statement wrote. */
	const refreshed: string[][] = [];
	const deleteGate = { held: Promise.resolve() as Promise<void> };
	/** Each record apply waits on the next gate, if any. */
	const applyGates: Promise<void>[] = [];
	const subjectSnapshotsConfig = createSubjectSnapshotsStore({ mode });
	const committer: Committer = {
		apply: async ({ records, expectedOffset, snapshotIntent }) => {
			if (records.length === 0 && snapshotIntent) {
				const entries = [...snapshotIntent.values()];
				if (entries.every((entry) => entry === "delete")) {
					await deleteGate.held;
					deleted.push([...snapshotIntent.keys()]);
					return {
						nextOffset: expectedOffset,
						deletedSnapshots: [...snapshotIntent.keys()].flatMap((key) => {
							const customer = partitionKeyToMeteringIdentity({
								partitionKey: key,
							});
							return rowsOf(customer.customerId).map((entityId) => ({
								...customer,
								entityId,
							}));
						}),
					};
				}
				refreshed.push(
					entries.flatMap((entry) =>
						entry === "delete"
							? []
							: entry.states.map((state) =>
									meteringIdentityToSubjectKey({ identity: state.identity }),
								),
					),
				);
				return { nextOffset: expectedOffset };
			}
			await applyGates.shift();
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
			subjectSnapshotsConfig,
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
			db,
			subjectSnapshotsConfig,
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
	return { processor, deleted, refreshed, deleteGate, applyGates };
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
		const evicted = processor.evict({
			command: evictOf({ customerId: "cus_other" }),
		});
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
		await evicted;
		expect(deleted).toEqual([[keyOf("cus_other")]]);
	});

	test.each([true, false])(
		"an evict over HTTP answers only once its snapshot DELETE has landed (evicts logged: %p)",
		async (logsEvicts) => {
			const { processor, deleted, deleteGate } = await createProcessor({
				logsEvicts,
			});
			const held = Promise.withResolvers<void>();
			deleteGate.held = held.promise;

			let answered = false;
			const evicted = processor
				.evict({ command: evictOf({ customerId: "cus_1" }) })
				.then(() => {
					answered = true;
				});
			await Bun.sleep(5);
			expect(deleted).toEqual([]);
			expect(answered).toBe(false);

			held.resolve();
			await evicted;
			expect(deleted).toEqual([[keyOf("cus_1")]]);
		},
	);

	test("off, an evict waits only for the writes before it, as without snapshots: a commit pinning the customer after it is not waited on", async () => {
		const { processor, deleted, applyGates } = await createProcessor({
			logsEvicts: false,
			mode: "off",
		});
		await processor.initialize({ request: createInitializeRequest() });
		await processor.drain();
		const first = Promise.withResolvers<void>();
		const second = Promise.withResolvers<void>();
		applyGates.push(first.promise, second.promise);
		try {
			await processor.track({
				command: createTrackCommand({ commandId: "t1", value: 1 }),
			});
			let answered = false;
			const evicted = processor
				.evict({ command: evictOf({ customerId: testIdentity.customerId }) })
				.then(() => {
					answered = true;
				});
			await processor.track({
				command: createTrackCommand({ commandId: "t2", value: 1 }),
			});
			first.resolve();
			for (let attempt = 0; !answered && attempt < 50; attempt++)
				await Bun.sleep(2);
			// t2 is appended but not stored: only the store of t1, which preceded the evict, is waited on.
			expect(answered).toBe(true);
			await evicted;
		} finally {
			first.resolve();
			second.resolve();
		}
		await processor.drain();
		expect(deleted).toEqual([]);
	});

	test("an evict with nothing resident still lands its DELETE before it answers", async () => {
		const { processor, deleted } = await createProcessor({ logsEvicts: false });
		await processor.evict({ command: evictOf({ customerId: "cus_nobody" }) });
		expect(deleted).toEqual([[keyOf("cus_nobody")]]);
	});

	test("queued evicts never wait on the lane, and the ones behind an in-flight DELETE share the next", async () => {
		// The stream is serial and answers nobody, so consumeEvict asks for no wait.
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
				run: (scope) =>
					scope.evict({
						command: evictOf({ customerId }),
						waitsForSnapshotDelete: false,
					}),
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

describe("evict snapshot refreshes", () => {
	const identityOf = (customerId: string, entityId: string | null = null) => ({
		orgId: "org_1",
		env: "sandbox",
		customerId,
		entityId,
	});

	const envelopeOf = (identity: {
		customerId: string;
		entityId: string | null;
	}): SubjectRowsEnvelope => ({
		customer: {
			internal_id: `${identity.customerId}_internal`,
			id: identity.customerId,
			org_id: "org_1",
			env: AppEnv.Sandbox,
			created_at: 1_700_000_000_000,
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
		entity: identity.entityId
			? {
					id: identity.entityId,
					internal_id: `${identity.entityId}_internal`,
					internal_customer_id: `${identity.customerId}_internal`,
					feature_id: "seats",
					internal_feature_id: "feat_seats",
					org_id: "org_1",
					env: AppEnv.Sandbox,
					created_at: 1_700_000_000_000,
					name: null,
					deleted: false,
				}
			: null,
	});

	/** A Postgres whose full reads answer the subject's own empty rows, counting each read. */
	const createReadingDb = () => {
		const fullReads: string[] = [];
		const db: WorkerDb = {
			...createSyntheticWorkerDb(),
			getSubjectRows: async ({ identity }) => {
				fullReads.push(meteringIdentityToSubjectKey({ identity }));
				return envelopeOf(identity);
			},
		};
		return { db, fullReads };
	};

	test("an evict asked to refresh rebuilds exactly the rows its DELETE removed, after it landed", async () => {
		const { db, fullReads } = createReadingDb();
		const { processor, deleted, refreshed } = await createProcessor({
			logsEvicts: false,
			db,
			rowsOf: () => [null, "en_1"],
		});
		await processor.evict({
			command: evictOf({ customerId: "cus_1", refreshSnapshots: true }),
		});
		expect(deleted).toEqual([[keyOf("cus_1")]]);
		await processor.drain();
		await Bun.sleep(10);
		expect(fullReads.sort()).toEqual(
			[identityOf("cus_1"), identityOf("cus_1", "en_1")]
				.map((identity) => meteringIdentityToSubjectKey({ identity }))
				.sort(),
		);
		expect(refreshed.flat().sort()).toEqual(fullReads.sort());
	});

	test("a DELETE that removed nothing, or an evict not asked to refresh, rebuilds nothing", async () => {
		const none = createReadingDb();
		const silent = createReadingDb();
		const noRows = await createProcessor({ logsEvicts: false, db: none.db });
		const notAsked = await createProcessor({
			logsEvicts: false,
			db: silent.db,
			rowsOf: () => [null],
		});
		await noRows.processor.evict({
			command: evictOf({ customerId: "cus_1", refreshSnapshots: true }),
		});
		await notAsked.processor.evict({
			command: evictOf({ customerId: "cus_1" }),
		});
		await Bun.sleep(10);
		expect(none.fullReads).toEqual([]);
		expect(silent.fullReads).toEqual([]);
		expect(noRows.refreshed).toEqual([]);
		expect(notAsked.refreshed).toEqual([]);
	});

	test("an oversized customer stays deleted while its small entity refresh lands", async () => {
		const db: WorkerDb = {
			...createSyntheticWorkerDb(),
			getSubjectRows: async ({ identity }) => {
				const rows = envelopeOf(identity);
				if (!identity.entityId)
					rows.customer.metadata = { padding: "x".repeat(262_145) };
				return rows;
			},
		};
		const { processor, deleted, refreshed } = await createProcessor({
			logsEvicts: false,
			db,
			rowsOf: () => [null, "en_1"],
		});
		await processor.evict({
			command: evictOf({ customerId: "cus_1", refreshSnapshots: true }),
		});
		for (let attempt = 0; refreshed.length === 0 && attempt < 100; attempt++)
			await Bun.sleep(2);
		expect(deleted).toEqual([[keyOf("cus_1")]]);
		expect(refreshed.flat()).toEqual([
			meteringIdentityToSubjectKey({ identity: identityOf("cus_1", "en_1") }),
		]);
	});
});
