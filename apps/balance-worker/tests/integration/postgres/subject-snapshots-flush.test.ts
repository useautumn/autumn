import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import {
	claimPartitionProgress,
	commitFlush,
	FlushBookmarkConflictError,
	flushSql,
	insertPartitionProgress,
	type PostgresClient,
	readPartitionProgress,
	readSubjectSnapshot,
	type SubjectSnapshotUpsert,
} from "@autumn/postgres";
import { sql } from "drizzle-orm";
import { readSubjectSnapshotSql } from "../../../../../packages/postgres/src/subjects/repos/subjectSnapshots/readSubjectSnapshot.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { defaultSubjectSnapshotsEdgeConfig } from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import { createState } from "../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../fixtures/subjectSnapshotsStore.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();
const PARTITION_COUNT = 64;

type SnapshotRow = {
	org_id: string;
	env: string;
	customer_id: string;
	entity_id: string;
	internal_customer_id: string;
	internal_entity_id: string | null;
	partition: number;
	partition_count: number;
	state_version: number;
	state: unknown;
	baseline_at: string;
	written_at: string;
	log_offset: string | null;
};

describe.skipIf(!databaseUrl)("subject snapshot flush", () => {
	let postgres: PostgresClient;

	beforeAll(() => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
	});

	afterAll(async () => {
		await postgres?.close();
	});

	const topicOf = () => `snapshot-flush-${crypto.randomUUID()}`;

	const seedEntity = async ({
		seeded,
		entityId,
	}: {
		seeded: SeededCustomer;
		entityId: string;
	}): Promise<string> => {
		const internalEntityId = `ent_int_${crypto.randomUUID().slice(0, 8)}`;
		await postgres.db.execute(sql`INSERT INTO entities
			(internal_id, id, internal_customer_id, org_id, env, created_at)
			VALUES (${internalEntityId}, ${entityId}, ${seeded.internalCustomerId}, ${seeded.orgId}, ${seeded.env}, ${Date.now()})`);
		return internalEntityId;
	};

	const upsertOf = ({
		seeded,
		entityId = null,
		internalEntityId = null,
		partition = 5,
		revision = 1,
		logOffset = 41n,
	}: {
		seeded: SeededCustomer;
		entityId?: string | null;
		internalEntityId?: string | null;
		partition?: number;
		revision?: number;
		logOffset?: bigint;
	}): SubjectSnapshotUpsert => ({
		orgId: seeded.orgId,
		env: seeded.env,
		customerId: seeded.identity.customerId,
		entityId,
		internalCustomerId: seeded.internalCustomerId,
		internalEntityId,
		partition,
		partitionCount: PARTITION_COUNT,
		stateVersion: 1,
		stateJson: JSON.stringify({ revision, entityId }),
		baselineAt: 1_700_000_000_000,
		logOffset,
	});

	const readSnapshots = async ({
		seeded,
	}: {
		seeded: SeededCustomer;
	}): Promise<SnapshotRow[]> =>
		(await postgres.db.execute(
			sql`SELECT * FROM subject_snapshots WHERE org_id = ${seeded.orgId} ORDER BY entity_id`,
		)) as unknown as SnapshotRow[];

	const flushAt = async ({
		topic,
		expectedOffset = 40n,
		changes = [],
		upserts = [],
		deletes = [],
		statementTimeoutMs = 2_000,
	}: {
		topic: string;
		expectedOffset?: bigint;
		changes?: Parameters<typeof commitFlush>[0]["request"]["changes"];
		upserts?: SubjectSnapshotUpsert[];
		deletes?: { orgId: string; env: string; customerId: string }[];
		statementTimeoutMs?: number;
	}) =>
		commitFlush({
			ctx: { db: postgres.db },
			request: {
				changes,
				bookmarks: [{ topic, partition: 5, expectedOffset, nextOffset: 42n }],
				snapshots: { upserts, deletes },
			},
			statementTimeoutMs,
		});

	test("a 10,000-evict storm lands as ceil(10,000 / batch) DELETEs, one in flight, within a second", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		let inFlight = 0;
		let maxInFlight = 0;
		const statementMs: number[] = [];
		let deleted = 0;
		const db: CommitterDb = {
			readPartitionProgress: async () => null,
			insertPartitionProgress: async () => {},
			claimPartitionProgress: async () => {},
			flush: async (request) => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				const startedAt = performance.now();
				try {
					const result = await commitFlush({
						ctx: { db: postgres.db },
						request,
						statementTimeoutMs: 10_000,
					});
					deleted += result.snapshots?.deleted.length ?? 0;
					return result;
				} finally {
					statementMs.push(performance.now() - startedAt);
					inFlight -= 1;
				}
			},
		};
		const subjectSnapshotsConfig = createSubjectSnapshotsStore({
			mode: "write",
		});
		const committer = createCommitter({
			ctx: { db, subjectSnapshotsConfig },
			config: {
				concurrency: 4,
				maxRowsPerFlush: 500,
				retry: {
					degradedAfterAttempts: 1,
					initialBackoffMs: 1,
					maxBackoffMs: 1,
				},
				snapshots: { partitionCount: 64 },
			},
		});
		const store = createCommitterStateStore({
			ctx: {
				committer,
				db,
				subjectSnapshotsConfig,
			},
		});
		try {
			await postgres.db.execute(sql`INSERT INTO subject_snapshots (org_id, env, customer_id, entity_id, internal_customer_id, partition, partition_count, state_version, state, baseline_at, written_at)
				SELECT ${seeded.orgId}, ${seeded.env}, 'cus_storm_' || i, '', ${seeded.internalCustomerId}, 0, 64, 1, '{}'::jsonb, 0, 0 FROM generate_series(0, 9999) i`);
			const deletes = store.snapshotQueues;
			if (!deletes) throw new Error("Expected snapshot writes");
			const startedAt = performance.now();
			for (let index = 0; index < 10_000; index++)
				deletes.enqueueDelete({
					topic,
					partition: 0,
					customerKey: meteringIdentityToPartitionKey({
						identity: {
							orgId: seeded.orgId,
							env: seeded.env,
							customerId: `cus_storm_${index}`,
							entityId: null,
						},
					}),
				});
			const enqueuedMs = performance.now() - startedAt;
			while (deleted < 10_000 && performance.now() - startedAt < 10_000)
				await Bun.sleep(5);
			const durationMs = performance.now() - startedAt;

			const statements = Math.ceil(
				10_000 / defaultSubjectSnapshotsEdgeConfig().dropBatch,
			);
			expect(statementMs).toHaveLength(statements);
			expect(deleted).toBe(10_000);
			expect(maxInFlight).toBe(1);
			expect(durationMs).toBeLessThan(1_000);
			expect(
				await postgres.db.execute(
					sql`SELECT 1 FROM subject_snapshots WHERE org_id = ${seeded.orgId} AND env = ${seeded.env}`,
				),
			).toHaveLength(0);
			const sorted = [...statementMs].sort((a, b) => a - b);
			console.info(
				"[snapshot evict storm]",
				JSON.stringify({
					customers: 10_000,
					statements,
					maxInFlight,
					enqueueMs: Math.round(enqueuedMs * 100) / 100,
					statementP50Ms:
						Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 100) /
						100,
					statementP99Ms:
						Math.round(
							(sorted[
								Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))
							] ?? 0) * 100,
						) / 100,
					durationMs: Math.round(durationMs),
				}),
			);
		} finally {
			store.close();
			await seeded.cleanup();
		}
	});

	test("a flush writes each subject's row under the identity it was held by, with its partition and lineage", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		const internalEntityId = await seedEntity({ seeded, entityId: "seat_1" });
		try {
			const result = await flushAt({
				topic,
				upserts: [
					upsertOf({ seeded }),
					upsertOf({ seeded, entityId: "seat_1", internalEntityId }),
				],
			});

			expect(result.snapshots).toEqual({ upserted: 2, deleted: [] });
			const rows = await readSnapshots({ seeded });
			expect(
				rows.map(({ written_at, ...row }) => ({
					...row,
					written: Number(written_at) > 0,
				})),
			).toEqual([
				{
					org_id: seeded.orgId,
					env: seeded.env,
					customer_id: seeded.identity.customerId,
					entity_id: "",
					internal_customer_id: seeded.internalCustomerId,
					internal_entity_id: null,
					partition: 5,
					partition_count: PARTITION_COUNT,
					state_version: 1,
					state: { revision: 1, entityId: null },
					baseline_at: "1700000000000",
					log_offset: "41",
					written: true,
				},
				{
					org_id: seeded.orgId,
					env: seeded.env,
					customer_id: seeded.identity.customerId,
					entity_id: "seat_1",
					internal_customer_id: seeded.internalCustomerId,
					internal_entity_id: internalEntityId,
					partition: 5,
					partition_count: PARTITION_COUNT,
					state_version: 1,
					state: { revision: 1, entityId: "seat_1" },
					baseline_at: "1700000000000",
					log_offset: "41",
					written: true,
				},
			]);

			// The next flush replaces the row in place; a write from an older log, such as a refresh read before that flush landed, does not.
			await flushAt({
				topic,
				expectedOffset: 42n,
				upserts: [upsertOf({ seeded, revision: 2, logOffset: 43n })],
			});
			const stale = await flushAt({
				topic,
				expectedOffset: 42n,
				upserts: [upsertOf({ seeded, revision: 3, logOffset: 42n })],
			});
			expect(stale.snapshots?.upserted).toBe(0);
			const [customerRow] = await readSnapshots({ seeded });
			expect(customerRow?.state).toEqual({ revision: 2, entityId: null });
			expect(customerRow?.log_offset).toBe("43");
		} finally {
			await seeded.cleanup();
		}
	});

	test("a cold load reads back what the flush wrote, by primary key at this build's version: the customer's and its entity's states, null for a stranger or another version", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		try {
			await insertPartitionProgress({
				ctx: { db: postgres.db },
				topic,
				partition: 5,
				nextOffset: 40n,
			});
			const internalEntityId = await seedEntity({ seeded, entityId: "seat_1" });
			await flushAt({
				topic,
				upserts: [
					upsertOf({ seeded, revision: 7 }),
					upsertOf({
						seeded,
						entityId: "seat_1",
						internalEntityId,
						revision: 8,
					}),
				],
			});

			const ctx = { db: postgres.db, orgId: seeded.orgId, env: seeded.env };
			const read = (
				entityId: string | null,
				stateVersion = 1,
				customerId = seeded.identity.customerId,
			) => readSubjectSnapshot({ ctx, customerId, entityId, stateVersion });
			expect(await read(null)).toEqual({ revision: 7, entityId: null });
			expect(await read("seat_1")).toEqual({ revision: 8, entityId: "seat_1" });
			expect(await read(null, 2)).toBeNull();
			expect(await read(null, 1, "cus_nobody")).toBeNull();
		} finally {
			await seeded.cleanup();
		}
	});

	test("a delete takes the customer's own row and every entity row, and nobody else's", async () => {
		const seeded = await seedCustomer({ postgres });
		const other = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		const entityIds = ["seat_1", "seat_2", "seat_3"];
		const internalEntityIds = await Promise.all(
			entityIds.map((entityId) => seedEntity({ seeded, entityId })),
		);
		try {
			await flushAt({
				topic,
				upserts: [
					upsertOf({ seeded }),
					...entityIds.map((entityId, index) =>
						upsertOf({
							seeded,
							entityId,
							internalEntityId: internalEntityIds[index] ?? null,
						}),
					),
					upsertOf({ seeded: other }),
				],
			});
			expect(await readSnapshots({ seeded })).toHaveLength(4);

			const result = await flushAt({
				topic,
				expectedOffset: 42n,
				deletes: [
					{
						orgId: seeded.orgId,
						env: seeded.env,
						customerId: seeded.identity.customerId,
					},
				],
			});

			// The statement says which subjects went: the customer's own and its three entities, nobody else's.
			const deletedOf = (entityId: string | null) => ({
				orgId: seeded.orgId,
				env: seeded.env,
				customerId: seeded.identity.customerId,
				entityId,
			});
			expect(result.snapshots?.upserted).toBe(0);
			expect(
				[...(result.snapshots?.deleted ?? [])].sort((a, b) =>
					(a.entityId ?? "").localeCompare(b.entityId ?? ""),
				),
			).toEqual([deletedOf(null), ...entityIds.map(deletedOf)]);
			expect(await readSnapshots({ seeded })).toEqual([]);
			expect(await readSnapshots({ seeded: other })).toHaveLength(1);
		} finally {
			await seeded.cleanup();
			await other.cleanup();
		}
	});

	test("a guard miss rolls the snapshot back with the rows", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		try {
			const result = await flushAt({
				topic,
				changes: [
					{
						op: "update",
						table: "customerEntitlements",
						id: seeded.customerEntitlementId,
						set: { balance: 1 },
						add: {},
						addEntries: {},
						guard: { balance: -12345 },
					},
				],
				upserts: [upsertOf({ seeded })],
			});

			expect(result.applied).toEqual([false]);
			expect(result.snapshots).toEqual({ upserted: 0, deleted: [] });
			expect(await readSnapshots({ seeded })).toEqual([]);
			expect(await seeded.readNextOffset({ topic, partition: 5 })).toBe(40n);
		} finally {
			await seeded.cleanup();
		}
	});

	test("a bookmark another writer moved rolls the snapshot back with it", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 45n,
		});
		try {
			await expect(
				flushAt({ topic, upserts: [upsertOf({ seeded })] }),
			).rejects.toBeInstanceOf(FlushBookmarkConflictError);
			expect(await readSnapshots({ seeded })).toEqual([]);
		} finally {
			await seeded.cleanup();
		}
	});

	test("a late evict from an owner the partition has left still deletes the row: a DELETE is always safe, and the next load is a full query", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
			claimToken: "owner_a",
		});
		try {
			await flushAt({ topic, upserts: [upsertOf({ seeded })] });
			await claimPartitionProgress({
				ctx: { db: postgres.db },
				topic,
				partition: 5,
				claimToken: "owner_b",
			});

			const lateEvict = await commitFlush({
				ctx: { db: postgres.db },
				request: {
					changes: [],
					bookmarks: [],
					snapshots: {
						upserts: [],
						deletes: [
							{
								orgId: seeded.orgId,
								env: seeded.env,
								customerId: seeded.identity.customerId,
							},
						],
					},
				},
				statementTimeoutMs: 2_000,
			});

			expect(lateEvict).toEqual({
				applied: [],
				snapshots: {
					upserted: 0,
					deleted: [
						{
							orgId: seeded.orgId,
							env: seeded.env,
							customerId: seeded.identity.customerId,
							entityId: null,
						},
					],
				},
			});
			expect(await readSnapshots({ seeded })).toEqual([]);
			expect(await seeded.readNextOffset({ topic, partition: 5 })).toBe(42n);
			expect(
				await readPartitionProgress({
					ctx: { db: postgres.db },
					topic,
					partition: 5,
				}),
			).toMatchObject({ claimToken: "owner_b" });
		} finally {
			await seeded.cleanup();
		}
	});

	test("a late refresh from an owner the partition has left rolls back on its bookmark: a stale read never resurrects a row", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
			claimToken: "owner_a",
		});
		try {
			await claimPartitionProgress({
				ctx: { db: postgres.db },
				topic,
				partition: 5,
				claimToken: "owner_b",
			});

			// What the lane sends for a refresh: no records, the bookmark it last saw, its own claim.
			const lateRefresh = commitFlush({
				ctx: { db: postgres.db },
				request: {
					changes: [],
					bookmarks: [
						{
							topic,
							partition: 5,
							expectedOffset: 40n,
							nextOffset: 40n,
							claimToken: "owner_a",
						},
					],
					snapshots: { upserts: [upsertOf({ seeded })], deletes: [] },
				},
				statementTimeoutMs: 2_000,
			});

			await expect(lateRefresh).rejects.toBeInstanceOf(
				FlushBookmarkConflictError,
			);
			expect(await readSnapshots({ seeded })).toEqual([]);
			expect(await seeded.readNextOffset({ topic, partition: 5 })).toBe(40n);
		} finally {
			await seeded.cleanup();
		}
	});

	test("a refresh and an evict for the same customer land in lane order: the DELETE after leaves no row and names it", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		const db: CommitterDb = {
			readPartitionProgress: async () => null,
			insertPartitionProgress: (params) =>
				insertPartitionProgress({ ctx: { db: postgres.db }, ...params }),
			claimPartitionProgress: async () => {},
			flush: (request) =>
				commitFlush({
					ctx: { db: postgres.db },
					request,
					statementTimeoutMs: 10_000,
				}),
		};
		const subjectSnapshotsConfig = createSubjectSnapshotsStore({
			mode: "write",
		});
		const committer = createCommitter({
			ctx: { db, subjectSnapshotsConfig },
			config: {
				concurrency: 1,
				maxRowsPerFlush: 500,
				retry: {
					degradedAfterAttempts: 1,
					initialBackoffMs: 1,
					maxBackoffMs: 1,
				},
				snapshots: { partitionCount: 64 },
			},
		});
		const store = createCommitterStateStore({
			ctx: { committer, db, subjectSnapshotsConfig },
		});
		try {
			await store.initializePartition({ topic, partition: 0, nextOffset: 0n });
			const writes = store.snapshotQueues;
			if (!writes) throw new Error("Expected snapshot writes");
			const customerKey = meteringIdentityToPartitionKey({
				identity: { ...seeded.identity, entityId: null },
			});
			const fresh = createState({
				identity: { ...seeded.identity, entityId: null },
			});
			const state = {
				...fresh,
				customer: { ...fresh.customer, internal_id: seeded.internalCustomerId },
			};
			writes.enqueueRefresh({
				topic,
				partition: 0,
				state,
				baselineAt: 1,
				logOffset: 0n,
			});
			await committer.drain();
			await Bun.sleep(20);
			// The refresh landed under the bookmark; the DELETE enqueued after it lands after it, and says which row went.
			expect(await readSnapshots({ seeded })).toHaveLength(1);
			writes.enqueueDelete({ topic, partition: 0, customerKey });
			const deleted = await writes.deleteLanded({
				topic,
				partition: 0,
				customerKey,
			});

			expect(deleted).toEqual([{ ...seeded.identity, entityId: null }]);
			expect(await readSnapshots({ seeded })).toEqual([]);
		} finally {
			store.close();
			await seeded.cleanup();
		}
	});

	test("a statement timeout rolls the snapshot back with the rows", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		const blocker = openFixturePostgres({ databaseUrl: databaseUrl ?? "" });
		const held = Promise.withResolvers<void>();
		const locked = Promise.withResolvers<void>();
		// Another session holds the bookmark row, so the flush statement waits past its timeout.
		const holding = blocker.db.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT 1 FROM partition_progress WHERE topic = ${topic} FOR UPDATE`,
			);
			locked.resolve();
			await held.promise;
		});
		try {
			await locked.promise;
			await expect(
				flushAt({
					topic,
					upserts: [upsertOf({ seeded })],
					statementTimeoutMs: 200,
				}),
			).rejects.toThrow();
			held.resolve();
			await holding;
			expect(await readSnapshots({ seeded })).toEqual([]);
		} finally {
			held.resolve();
			await holding.catch(() => undefined);
			await blocker.close();
			await seeded.cleanup();
		}
	});

	test("a row whose customer or entity is already gone is skipped, and the flush still lands", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		try {
			const result = await flushAt({
				topic,
				upserts: [
					upsertOf({ seeded }),
					upsertOf({
						seeded,
						entityId: "seat_gone",
						internalEntityId: "ent_int_never_existed",
					}),
					{
						...upsertOf({ seeded }),
						customerId: "cus_gone",
						internalCustomerId: "cus_int_never_existed",
					},
				],
			});

			expect(result.snapshots).toEqual({ upserted: 1, deleted: [] });
			expect(
				(await readSnapshots({ seeded })).map((row) => row.entity_id),
			).toEqual([""]);
			expect(
				await postgres.db.execute(
					sql`SELECT 1 FROM subject_snapshots WHERE org_id = ${seeded.orgId} AND env = ${seeded.env} AND customer_id = 'cus_gone'`,
				),
			).toHaveLength(0);
			expect(await seeded.readNextOffset({ topic, partition: 5 })).toBe(42n);
		} finally {
			await seeded.cleanup();
		}
	});

	test("deleting the customer or one of its entities cascades to their rows", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		await insertPartitionProgress({
			ctx: { db: postgres.db },
			topic,
			partition: 5,
			nextOffset: 40n,
		});
		const internalEntityIds = await Promise.all(
			["seat_1", "seat_2"].map((entityId) => seedEntity({ seeded, entityId })),
		);
		try {
			await flushAt({
				topic,
				upserts: [
					upsertOf({ seeded }),
					upsertOf({
						seeded,
						entityId: "seat_1",
						internalEntityId: internalEntityIds[0] ?? null,
					}),
					upsertOf({
						seeded,
						entityId: "seat_2",
						internalEntityId: internalEntityIds[1] ?? null,
					}),
				],
			});

			await postgres.db.execute(
				sql`DELETE FROM entities WHERE internal_id = ${internalEntityIds[0] ?? ""}`,
			);
			expect(
				(await readSnapshots({ seeded })).map((row) => row.entity_id),
			).toEqual(["", "seat_2"]);

			await postgres.db.execute(
				sql`DELETE FROM entities WHERE internal_customer_id = ${seeded.internalCustomerId}`,
			);
			await postgres.db.execute(
				sql`DELETE FROM customer_entitlements WHERE internal_customer_id = ${seeded.internalCustomerId}`,
			);
			await postgres.db.execute(
				sql`DELETE FROM customer_products WHERE internal_customer_id = ${seeded.internalCustomerId}`,
			);
			await postgres.db.execute(
				sql`DELETE FROM customers WHERE internal_id = ${seeded.internalCustomerId}`,
			);
			expect(await readSnapshots({ seeded })).toEqual([]);
		} finally {
			await seeded.cleanup();
		}
	});

	test("an evict batch of 200 customers deletes by primary key probes, never a scan of the table", async () => {
		const seeded = await seedCustomer({ postgres });
		const rolledBack = new Error("explain only");
		let plan = "";
		try {
			// Populated and analyzed inside a transaction that never commits, so the plan is the one a full table gets.
			await postgres.db
				.transaction(async (tx) => {
					await tx.execute(sql`INSERT INTO customers (internal_id, id, org_id, env, created_at)
						SELECT ${seeded.orgId} || '_c' || n, 'cus_' || n, ${seeded.orgId}, 'live', 0
						FROM generate_series(1, 20000) AS n`);
					await tx.execute(sql`INSERT INTO subject_snapshots
						(org_id, env, customer_id, entity_id, internal_customer_id, partition, partition_count, state_version, state, baseline_at, written_at)
						SELECT ${seeded.orgId}, 'live', 'cus_' || n, '', ${seeded.orgId} || '_c' || n, n % 64, 64, 1, '{}'::jsonb, 0, 0
						FROM generate_series(1, 20000) AS n`);
					await tx.execute(sql`ANALYZE subject_snapshots`);
					const deletes = Array.from({ length: 200 }, (_, index) => ({
						org_id: seeded.orgId,
						env: "live",
						customer_id: `cus_${index * 50 + 1}`,
					}));
					// The statement an evict-only flush sends, so the plan is production's.
					const statement = flushSql({
						changes: [],
						bookmarks: [],
						snapshots: {
							upserts: [],
							deletes: deletes.map((d) => ({
								orgId: d.org_id,
								env: d.env,
								customerId: d.customer_id,
							})),
						},
					});
					const rows = (await tx.execute(
						sql`EXPLAIN (FORMAT JSON) ${statement}`,
					)) as unknown as {
						"QUERY PLAN": unknown;
					}[];
					plan = JSON.stringify(rows[0]?.["QUERY PLAN"]);
					throw rolledBack;
				})
				.catch((cause) => {
					if (cause !== rolledBack) throw cause;
				});
		} finally {
			await seeded.cleanup();
		}

		expect(plan).toContain('"Index Name":"subject_snapshots_pkey"');
		expect(plan).not.toMatch(
			/"Seq Scan"[^}]*"Relation Name":"subject_snapshots"/,
		);
	}, 30_000);

	test("a cold load's probe is one primary-key lookup, never a scan of the table", async () => {
		const seeded = await seedCustomer({ postgres });
		const rolledBack = new Error("explain only");
		let plan = "";
		try {
			await postgres.db
				.transaction(async (tx) => {
					await tx.execute(sql`INSERT INTO customers (internal_id, id, org_id, env, created_at)
						SELECT ${seeded.orgId} || '_c' || n, 'cus_' || n, ${seeded.orgId}, 'live', 0
						FROM generate_series(1, 20000) AS n`);
					await tx.execute(sql`INSERT INTO subject_snapshots
						(org_id, env, customer_id, entity_id, internal_customer_id, partition, partition_count, state_version, state, baseline_at, written_at)
						SELECT ${seeded.orgId}, 'live', 'cus_' || n, '', ${seeded.orgId} || '_c' || n, n % 64, 64, 1, '{}'::jsonb, 0, 0
						FROM generate_series(1, 20000) AS n`);
					await tx.execute(sql`ANALYZE subject_snapshots`);
					const ctx = { db: tx, orgId: seeded.orgId, env: "live" };
					const rows = (await tx.execute(
						sql`EXPLAIN (FORMAT JSON) ${readSubjectSnapshotSql({ ctx, customerId: "cus_51", entityId: null, stateVersion: 1 })}`,
					)) as unknown as { "QUERY PLAN": unknown }[];
					plan = JSON.stringify(rows[0]?.["QUERY PLAN"]);
					expect(
						await readSubjectSnapshot({
							ctx,
							customerId: "cus_51",
							entityId: null,
							stateVersion: 1,
						}),
					).toEqual({});
					throw rolledBack;
				})
				.catch((cause) => {
					if (cause !== rolledBack) throw cause;
				});
		} finally {
			await seeded.cleanup();
		}

		expect(plan).toContain('"Index Name":"subject_snapshots_pkey"');
		expect(plan).not.toMatch(
			/"Seq Scan"[^}]*"Relation Name":"subject_snapshots"/,
		);
	}, 30_000);
});
