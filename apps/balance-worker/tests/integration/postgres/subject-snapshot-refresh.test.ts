import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	type SubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import {
	commitFlush,
	insertPartitionProgress,
	type PostgresClient,
	readSubjectSnapshot,
} from "@autumn/postgres";
import { sql } from "drizzle-orm";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { createSubjectLoadGate } from "../../../src/external/postgres/createSubjectLoadGate.js";
import { createWorkerDb } from "../../../src/external/postgres/getWorkerDb.js";
import { createDatabaseTimings } from "../../../src/logging/databaseTimings.js";
import { createSubjectHydrator } from "../../../src/processor/subject/createSubjectHydrator.js";
import { createPartitionWriter } from "../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
import { createTestCatalogCache } from "../../fixtures/catalog.js";
import { createTrackCommand } from "../../fixtures/mutations.js";
import { createSubjectSnapshotsStore } from "../../fixtures/subjectSnapshotsStore.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();
const partition = 0;

describe.skipIf(!databaseUrl)("subject snapshot refresh", () => {
	let postgres: PostgresClient;

	beforeAll(() => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
	});

	afterAll(async () => {
		await postgres?.close();
	});

	/** The production hydrator over the production writer, committer and lane, on real Postgres; `gate` holds every full read's answer until released. */
	const createHydrator = async ({
		mode = "write",
		writtenAfter = 0,
		nextOffset = 0n,
	}: {
		mode?: "write" | "serve" | "verify";
		writtenAfter?: number;
		nextOffset?: bigint;
	} = {}) => {
		const topic = `snapshot-refresh-${crypto.randomUUID()}`;
		const reads: string[] = [];
		const entityProbes: string[][] = [];
		const entityReads: string[][] = [];
		const gate = { held: Promise.resolve() as Promise<void> };
		const timings = createDatabaseTimings();
		const subjectSnapshotsConfig = createSubjectSnapshotsStore({
			mode,
			writtenAfter,
		});
		const workerDb = createWorkerDb({
			ctx: {
				postgres,
				subjectLoads: createSubjectLoadGate({ config: { limit: 16 } }),
				timings,
				subjectSnapshotsConfig,
			},
		});
		const db: WorkerDb = {
			...workerDb,
			getSubjectRows: async (params) => {
				const { held } = gate;
				reads.push(params.identity.customerId);
				const rows = await workerDb.getSubjectRows(params);
				await held;
				return rows;
			},
			readEntitySubjectSnapshots: async (params) => {
				entityProbes.push([...params.entityIds]);
				return workerDb.readEntitySubjectSnapshots(params);
			},
			getEntitySubjectRows: async (params) => {
				entityReads.push([...params.entityIds]);
				return workerDb.getEntitySubjectRows(params);
			},
		};
		const committerDb: CommitterDb = {
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
		const committer = createCommitter({
			ctx: { db: committerDb, subjectSnapshotsConfig },
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
		const stateStore = createCommitterStateStore({
			ctx: { committer, db: committerDb, subjectSnapshotsConfig },
		});
		await stateStore.initializePartition({ topic, partition, nextOffset });
		const receiptPolicy = { retentionMs: 86_400_000, now: () => Date.now() };
		const writer = createPartitionWriter({
			ctx: {
				stateStore,
				appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
				subjectSnapshotsConfig,
				receiptPolicy,
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
					maxPendingCommandsPerCustomer: 100,
				},
			},
		});
		const hydrator = createSubjectHydrator({
			ctx: {
				catalogCache: createTestCatalogCache({ db }),
				db,
				writer,
				receiptPolicy,
				baseline: stateStore.baseline,
				subjectSnapshotsConfig,
				snapshotQueues: stateStore.snapshotQueues,
				position: { topic, partition },
				readNextOffset: stateStore.readNextOffset,
			},
		});
		const close = () => {
			hydrator.dispose();
			writer.dispose();
			stateStore.close();
		};
		return {
			hydrator,
			writer,
			committer,
			stateStore,
			reads,
			entityProbes,
			entityReads,
			gate,
			topic,
			close,
		};
	};

	const readRow = async ({
		identity,
	}: {
		identity: MeteringIdentity;
	}): Promise<SubjectState | null> =>
		(await readSubjectSnapshot({
			ctx: { db: postgres.db, orgId: identity.orgId, env: identity.env },
			customerId: identity.customerId,
			entityId: identity.entityId,
			probe: {
				stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
				writtenAfter: 0,
			},
		})) as SubjectState | null;

	const waitForRow = async ({
		identity,
	}: {
		identity: MeteringIdentity;
	}): Promise<SubjectState> => {
		for (let attempt = 0; attempt < 200; attempt++) {
			const row = await readRow({ identity });
			if (row) return row;
			await Bun.sleep(10);
		}
		throw new Error(`no snapshot row for ${identity.customerId}`);
	};

	const balanceOf = (state: SubjectState) =>
		state.customerEntitlements[0]?.balance;

	const waitUntil = async (condition: () => boolean) => {
		for (let attempt = 0; attempt < 500 && !condition(); attempt++)
			await Bun.sleep(2);
		expect(condition()).toBe(true);
	};

	test("a refresh reads the rows whole and writes the subject's row through the lane; nothing becomes resident", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const { hydrator, writer, reads, topic, close } = await createHydrator({
			nextOffset: 7n,
		});
		try {
			expect(await readRow({ identity: seeded.identity })).toBeNull();
			hydrator.refreshSnapshots({
				customer: seeded.identity,
				subjects: [seeded.identity],
			});

			const row = await waitForRow({ identity: seeded.identity });
			expect(balanceOf(row)).toBe(100);
			expect(reads).toEqual([seeded.identity.customerId]);
			expect(
				writer.readFreshestState({ identity: seeded.identity }),
			).toBeNull();
			expect(await seeded.readNextOffset({ topic, partition })).toBe(7n);
			const [snapshot] = await postgres.db.execute(
				sql`SELECT log_offset FROM subject_snapshots WHERE org_id = ${seeded.orgId} AND env = ${seeded.env} AND customer_id = ${seeded.identity.customerId} AND entity_id = ''`,
			);
			expect(String(snapshot?.log_offset)).toBe("6");
		} finally {
			close();
			await seeded.cleanup();
		}
	});

	test("a request arriving mid-refresh shares the read: one full read, the rows become resident for the request, and the row lands", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const { hydrator, writer, reads, gate, close } = await createHydrator();
		const held = Promise.withResolvers<void>();
		gate.held = held.promise;
		try {
			hydrator.refreshSnapshots({
				customer: seeded.identity,
				subjects: [seeded.identity],
			});
			await waitUntil(() => reads.length === 1);
			const ensured = hydrator.ensure({ identity: seeded.identity });
			await Bun.sleep(5);
			held.resolve();

			const { state } = await ensured;
			expect(balanceOf(state)).toBe(100);
			expect(
				writer.readFreshestState({ identity: seeded.identity }),
			).not.toBeNull();
			expect(balanceOf(await waitForRow({ identity: seeded.identity }))).toBe(
				100,
			);
			expect(reads).toEqual([seeded.identity.customerId]);
		} finally {
			close();
			await seeded.cleanup();
		}
	});

	test("a refresh of a subject a request is already reading waits for that read and reads the rows itself", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const { hydrator, reads, gate, close } = await createHydrator();
		const held = Promise.withResolvers<void>();
		gate.held = held.promise;
		try {
			const ensured = hydrator.ensure({ identity: seeded.identity });
			await waitUntil(() => reads.length === 1);
			hydrator.refreshSnapshots({
				customer: seeded.identity,
				subjects: [seeded.identity],
			});
			await Bun.sleep(5);
			expect(reads).toHaveLength(1);
			held.resolve();

			expect(balanceOf((await ensured).state)).toBe(100);
			expect(balanceOf(await waitForRow({ identity: seeded.identity }))).toBe(
				100,
			);
			expect(reads).toEqual([
				seeded.identity.customerId,
				seeded.identity.customerId,
			]);
		} finally {
			close();
			await seeded.cleanup();
		}
	});

	test("a refresh read before a flush landed never replaces that flush's row: the row keeps the newer balance", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const { hydrator, writer, committer, reads, gate, close } =
			await createHydrator();
		const { identity } = seeded;
		const request = Promise.withResolvers<void>();
		const refresh = Promise.withResolvers<void>();
		gate.held = request.promise;
		try {
			// The request's read makes the rows resident; the refresh queued behind it reads them itself.
			const ensured = hydrator.ensure({ identity });
			await waitUntil(() => reads.length === 1);
			hydrator.refreshSnapshots({ customer: identity, subjects: [identity] });
			gate.held = refresh.promise;
			request.resolve();
			const { state } = await ensured;
			await waitUntil(() => reads.length === 2);

			// With the refresh's answer (balance 100) still held, a track lands balance 95 in the rows and the row.
			const catalog = await hydrator.ensureCatalog({ identity, state });
			const command = createTrackCommand({
				identity,
				featureId: seeded.featureId,
				internalFeatureId: seeded.internalFeatureId,
				value: 5,
			});
			await writer
				.decide({
					command,
					mutate: ({ state: resident }) => {
						if (!resident) throw new Error("Expected the resident rows");
						const mutation = computeTrack({
							fullSubject: hydrator.readSubjectWith({
								state: resident,
								catalog,
								identity,
							}),
							command,
						});
						return {
							kind: "write",
							mutation,
							nextState: applyMutation({ state: resident, mutation }),
						};
					},
				})
				.waitForStore();
			expect(balanceOf(await waitForRow({ identity }))).toBe(95);

			refresh.resolve();
			await Bun.sleep(5);
			await committer.drain();
			expect(balanceOf(await waitForRow({ identity }))).toBe(95);
		} finally {
			close();
			await seeded.cleanup();
		}
	});

	/** An entity of the seeded customer, with no rows of its own: its state is the customer's with the entity attached. */
	const seedEntity = async ({
		seeded,
		entityId,
	}: {
		seeded: SeededCustomer;
		entityId: string;
	}): Promise<MeteringIdentity> => {
		await postgres.db.execute(sql`INSERT INTO entities
			(internal_id, id, internal_customer_id, org_id, env, created_at, name, feature_id, internal_feature_id)
			VALUES (${`${entityId}_internal`}, ${entityId}, ${seeded.internalCustomerId}, ${seeded.orgId}, ${seeded.env}, ${Date.now()}, 'Seat', ${seeded.featureId}, ${seeded.internalFeatureId})`);
		return { ...seeded.identity, entityId };
	};

	test("serving: an entity's cold load probes its row with its batch and skips the rows on a hit; a miss reads the rows for the misses alone", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const suffix = seeded.identity.customerId.slice(-8);
		const hitId = `en_hit_${suffix}`;
		const missId = `en_miss_${suffix}`;
		const hit = await seedEntity({ seeded, entityId: hitId });
		const miss = await seedEntity({ seeded, entityId: missId });
		const writing = await createHydrator({ mode: "serve" });
		try {
			// The production row for en_hit: read whole once, written through the lane as a refresh would.
			const { state } = await writing.hydrator.ensure({ identity: hit });
			writing.stateStore.snapshotQueues?.enqueueRefresh({
				topic: writing.topic,
				partition,
				state,
				baselineAt: Date.now(),
				logOffset: 0n,
			});
			await waitForRow({ identity: hit });
		} finally {
			writing.close();
		}

		const serving = await createHydrator({ mode: "serve" });
		try {
			await serving.hydrator.ensure({ identity: seeded.identity });
			const [served, read] = await Promise.all([
				serving.hydrator.ensure({ identity: hit }),
				serving.hydrator.ensure({ identity: miss }),
			]);
			expect(served.state.entity?.id).toBe(hitId);
			expect(read.state.entity?.id).toBe(missId);
			expect(serving.entityProbes).toEqual([[hitId, missId]]);
			expect(serving.entityReads).toEqual([[missId]]);
		} finally {
			serving.close();
			await postgres.db.execute(
				sql`DELETE FROM entities WHERE internal_customer_id = ${seeded.internalCustomerId}`,
			);
			await seeded.cleanup();
		}
	});

	test("writtenAfter: a row written at or before it is a miss for the customer's and the entity's probe alike; one written after it is served", async () => {
		const seeded = await seedCustomer({ postgres, balance: 100 });
		const entityId = `en_${seeded.identity.customerId.slice(-8)}`;
		const entity = await seedEntity({ seeded, entityId });
		const writing = await createHydrator();
		try {
			writing.hydrator.refreshSnapshots({
				customer: seeded.identity,
				subjects: [seeded.identity, entity],
			});
			await Promise.all([
				waitForRow({ identity: seeded.identity }),
				waitForRow({ identity: entity }),
			]);
		} finally {
			writing.close();
		}
		// The two rows may have landed on different ticks: the newest bounds the miss, the oldest the hit.
		const rows = (await postgres.db.execute(
			sql`SELECT min(written_at) AS oldest, max(written_at) AS newest FROM subject_snapshots WHERE org_id = ${seeded.orgId}`,
		)) as unknown as { oldest: string; newest: string }[];
		const writtenAt = {
			oldest: Number(rows[0]?.oldest),
			newest: Number(rows[0]?.newest),
		};

		const stale = await createHydrator({
			mode: "serve",
			writtenAfter: writtenAt.newest,
		});
		try {
			await stale.hydrator.ensure({ identity: seeded.identity });
			await stale.hydrator.ensure({ identity: entity });
			expect(stale.reads).toEqual([seeded.identity.customerId]);
			expect(stale.entityReads).toEqual([[entityId]]);
		} finally {
			stale.close();
		}

		const fresh = await createHydrator({
			mode: "serve",
			writtenAfter: writtenAt.oldest - 1,
		});
		try {
			await fresh.hydrator.ensure({ identity: seeded.identity });
			await fresh.hydrator.ensure({ identity: entity });
			expect(fresh.reads).toEqual([]);
			expect(fresh.entityReads).toEqual([]);
		} finally {
			fresh.close();
			await postgres.db.execute(
				sql`DELETE FROM entities WHERE internal_customer_id = ${seeded.internalCustomerId}`,
			);
			await seeded.cleanup();
		}
	});
});
