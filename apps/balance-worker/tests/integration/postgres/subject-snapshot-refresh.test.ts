import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import {
	commitFlush,
	insertPartitionProgress,
	type PostgresClient,
	readSubjectSnapshot,
} from "@autumn/postgres";
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

	/** The production hydrator over the production writer, committer and lane, on real Postgres; `gate` holds every full read until released. */
	const createHydrator = async () => {
		const topic = `snapshot-refresh-${crypto.randomUUID()}`;
		const reads: string[] = [];
		const gate = { held: Promise.resolve() as Promise<void> };
		const timings = createDatabaseTimings();
		const workerDb = createWorkerDb({
			ctx: {
				postgres,
				subjectLoads: createSubjectLoadGate({ config: { limit: 16 } }),
				timings,
			},
		});
		const db: WorkerDb = {
			...workerDb,
			getSubjectRows: async (params) => {
				reads.push(params.identity.customerId);
				await gate.held;
				return workerDb.getSubjectRows(params);
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
		const subjectSnapshotsConfig = createSubjectSnapshotsStore({
			mode: "write",
		});
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
		await stateStore.initializePartition({ topic, partition, nextOffset: 0n });
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
			},
		});
		const close = () => {
			hydrator.dispose();
			writer.dispose();
			stateStore.close();
		};
		return { hydrator, writer, reads, gate, topic, close };
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
			stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
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
		const { hydrator, writer, reads, topic, close } = await createHydrator();
		try {
			expect(await readRow({ identity: seeded.identity })).toBeNull();
			hydrator.refreshSnapshots({ identity: seeded.identity, entityIds: [] });

			const row = await waitForRow({ identity: seeded.identity });
			expect(balanceOf(row)).toBe(100);
			expect(reads).toEqual([seeded.identity.customerId]);
			expect(
				writer.readFreshestState({ identity: seeded.identity }),
			).toBeNull();
			expect(await seeded.readNextOffset({ topic, partition })).toBe(0n);
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
			hydrator.refreshSnapshots({ identity: seeded.identity, entityIds: [] });
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
			hydrator.refreshSnapshots({ identity: seeded.identity, entityIds: [] });
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
});
