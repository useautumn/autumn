import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	claimPartitionProgress,
	commitFlush,
	FlushBookmarkConflictError,
	insertPartitionProgress,
	type PostgresClient,
	readPartitionProgress,
	type SubjectSnapshotUpsert,
} from "@autumn/postgres";
import { sql } from "drizzle-orm";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { defaultSubjectSnapshotsEdgeConfig } from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

/** The control every store here reads: snapshots are written for the whole file. */
const writing = {
	read: () => ({
		...defaultSubjectSnapshotsEdgeConfig(),
		mode: "write" as const,
	}),
};

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

	test("10,000 one-tick eviction drops delete real rows in exactly ceil(10,000 / batch) statements", async () => {
		const seeded = await seedCustomer({ postgres });
		const topic = topicOf();
		let statements = 0;
		let deleted = 0;
		const db: CommitterDb = {
			readPartitionProgress: async () => null,
			insertPartitionProgress: async () => {},
			claimPartitionProgress: async () => {},
			flush: async (request) => {
				statements += 1;
				const result = await commitFlush({
					ctx: { db: postgres.db },
					request,
					statementTimeoutMs: 10_000,
				});
				deleted += result.snapshots?.deleted ?? 0;
				return result;
			},
		};
		const committer = createCommitter({
			ctx: { db },
			config: {
				concurrency: 1,
				maxRowsPerFlush: 500,
				retry: {
					degradedAfterAttempts: 1,
					initialBackoffMs: 1,
					maxBackoffMs: 1,
				},
				snapshots: { ...writing, partitionCount: 64 },
			},
		});
		const store = createCommitterStateStore({
			ctx: { committer, db },
			config: { subjectSnapshots: writing },
		});
		try {
			await postgres.db.execute(sql`INSERT INTO subject_snapshots (org_id, env, customer_id, entity_id, internal_customer_id, partition, partition_count, state_version, state, baseline_at, written_at)
				SELECT ${seeded.orgId}, ${seeded.env}, 'cus_storm_' || i, '', ${seeded.internalCustomerId}, 0, 64, 1, '{}'::jsonb, 0, 0 FROM generate_series(0, 9999) i`);
			const drops = store.subjectSnapshots;
			if (!drops) throw new Error("Expected snapshot drops");
			const startedAt = performance.now();
			await Promise.all(
				Array.from({ length: 10_000 }, (_, index) =>
					drops.dropCustomer({
						topic,
						partition: 0,
						customer: {
							orgId: seeded.orgId,
							env: seeded.env,
							customerId: `cus_storm_${index}`,
						},
					}),
				),
			);
			expect(statements).toBe(
				Math.ceil(10_000 / defaultSubjectSnapshotsEdgeConfig().dropBatch),
			);
			expect(deleted).toBe(10_000);
			expect(
				await postgres.db.execute(
					sql`SELECT 1 FROM subject_snapshots WHERE org_id = ${seeded.orgId} AND env = ${seeded.env}`,
				),
			).toHaveLength(0);
			console.info(
				"[snapshot one-tick drops]",
				JSON.stringify({
					customers: 10_000,
					statements,
					deleted,
					durationMs: Math.round(performance.now() - startedAt),
				}),
			);
		} finally {
			await store.close();
			await seeded.cleanup();
		}
	}, 60_000);

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
	}: {
		seeded: SeededCustomer;
		entityId?: string | null;
		internalEntityId?: string | null;
		partition?: number;
		revision?: number;
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
		logOffset: 41n,
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

			expect(result.snapshots).toEqual({ upserted: 2, deleted: 0 });
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

			// The next flush replaces the row in place.
			await flushAt({
				topic,
				expectedOffset: 42n,
				upserts: [upsertOf({ seeded, revision: 2 })],
			});
			const [customerRow] = await readSnapshots({ seeded });
			expect(customerRow?.state).toEqual({ revision: 2, entityId: null });
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

			expect(result.snapshots).toEqual({ upserted: 0, deleted: 4 });
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
			expect(result.snapshots).toEqual({ upserted: 0, deleted: 0 });
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
				snapshots: { upserted: 0, deleted: 1 },
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
				],
			});

			expect(result.snapshots).toEqual({ upserted: 1, deleted: 0 });
			expect(
				(await readSnapshots({ seeded })).map((row) => row.entity_id),
			).toEqual([""]);
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
					const rows = (await tx.execute(sql`EXPLAIN (FORMAT JSON)
						DELETE FROM subject_snapshots s
						USING jsonb_to_recordset(${JSON.stringify(deletes)}::text::jsonb) AS d(org_id text, env text, customer_id text)
						WHERE s.org_id = d.org_id COLLATE "C"
							AND s.env = d.env COLLATE "C"
							AND s.customer_id = d.customer_id COLLATE "C"`)) as unknown as {
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
	});
});
