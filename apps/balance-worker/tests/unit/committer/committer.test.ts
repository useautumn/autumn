import { describe, expect, test } from "bun:test";
import { LockAlreadyExistsError } from "@autumn/balance-engine";
import type { SubjectRowChange } from "@autumn/postgres";
import { FlushRecordRefusedError } from "../../../src/committer/committerErrors.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createState,
	createTrackCommand,
	createTrackMutation,
} from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const noRetry = { maxAttempts: 1, initialBackoffMs: 1, maxBackoffMs: 1 };

/** A Postgres stand-in whose flushes wait on a gate, so they can be observed mid-flight. */
function createGatedDb({
	failWhen,
	transientFailures = 0,
}: {
	failWhen?: (updates: readonly SubjectRowChange[]) => boolean;
	/** How many leading flushes fail with a retryable SQLSTATE before Postgres "recovers". */
	transientFailures?: number;
} = {}) {
	let remainingTransient = transientFailures;
	const transactions: {
		updates: readonly SubjectRowChange[];
		partitions: number[];
	}[] = [];
	let gate = Promise.withResolvers<void>();
	let open = false;
	const db: CommitterDb = {
		readNextOffset: async () => null,
		insertPartitionProgress: async () => {},
		flush: async (request) => {
			transactions.push({
				updates: request.changes,
				partitions: request.bookmarks.map((bookmark) => bookmark.partition),
			});
			if (!open) await gate.promise;
			if (remainingTransient > 0) {
				remainingTransient -= 1;
				throw Object.assign(new Error("connection reset"), { errno: "08006" });
			}
			if (failWhen?.(request.changes)) throw new Error("flush refused");
			return { applied: request.changes.map(() => true) };
		},
	};
	return {
		db,
		transactions,
		release: () => {
			gate.resolve();
			gate = Promise.withResolvers<void>();
		},
		openGate: () => {
			open = true;
			gate.resolve();
		},
	};
}

const record = ({
	partition,
	offset,
	commandId,
}: {
	partition: number;
	offset: bigint;
	commandId: string;
}) => ({
	position: { topic, partition, offset },
	mutation: createTrackMutation({
		state: createState({ balance: 100 }),
		value: 5,
		commandId,
	}),
});

const addsOf = (updates: readonly SubjectRowChange[]) =>
	updates.map((change) => (change.op === "update" ? change.add : null));

describe("committer", () => {
	test("calls queued during a flush fold into the next one, each settles with its own offset", async () => {
		const fake = createGatedDb();
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 1, maxRowsPerFlush: 500, retry: noRetry },
		});

		const first = committer.apply({
			topic,
			partition: 0,
			expectedOffset: 10n,
			records: [record({ partition: 0, offset: 10n, commandId: "a" })],
		});
		const second = committer.apply({
			topic,
			partition: 1,
			expectedOffset: 20n,
			records: [record({ partition: 1, offset: 20n, commandId: "b" })],
		});
		const third = committer.apply({
			topic,
			partition: 2,
			expectedOffset: 30n,
			records: [
				record({ partition: 2, offset: 30n, commandId: "c" }),
				record({ partition: 2, offset: 31n, commandId: "d" }),
			],
		});

		expect(fake.transactions).toHaveLength(1);
		fake.release();
		expect(await first).toEqual({ nextOffset: 11n });
		await Promise.resolve();
		expect(fake.transactions).toHaveLength(2);
		fake.release();
		expect(await second).toEqual({ nextOffset: 21n });
		expect(await third).toEqual({ nextOffset: 32n });
		expect(fake.transactions[1]?.partitions).toEqual([1, 2]);
		expect(addsOf(fake.transactions[1]?.updates ?? [])).toEqual([
			{ balance: -5 },
			{ balance: -5 },
			{ balance: -5 },
		]);
		await committer.drain();
	});

	test("a poison record is isolated: other partitions land, its own earlier records land, it alone is left behind", async () => {
		const fake = createGatedDb({
			failWhen: (updates) =>
				updates.some(
					(change) => change.op === "update" && change.id === "poison",
				),
		});
		fake.openGate();
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 1, maxRowsPerFlush: 500, retry: noRetry },
		});
		const poison = record({ partition: 0, offset: 1n, commandId: "b" });
		poison.mutation.changes = poison.mutation.changes.map((change) => ({
			...change,
			id: "poison",
		}));

		const [poisoned, healthy] = await Promise.all([
			committer.apply({
				topic,
				partition: 0,
				expectedOffset: 0n,
				records: [
					record({ partition: 0, offset: 0n, commandId: "a" }),
					poison,
					record({ partition: 0, offset: 2n, commandId: "c" }),
				],
			}),
			committer.apply({
				topic,
				partition: 1,
				expectedOffset: 0n,
				records: [record({ partition: 1, offset: 0n, commandId: "d" })],
			}),
		]);

		expect(healthy).toEqual({ nextOffset: 1n });
		expect(poisoned.nextOffset).toBe(1n);
		expect(poisoned.failure?.record).toBe(poison);
		expect(poisoned.failure?.cause).toBeInstanceOf(Error);
		// Partition 0's batch (the lane was free, so it went alone) fails, then record a lands,
		// then the poison record fails alone and c is not attempted; partition 1 follows untouched.
		expect(
			fake.transactions.map((transaction) => transaction.partitions),
		).toEqual([[0], [0], [0], [1]]);
		await committer.drain();
	});

	test("a record Postgres will never take is skipped: it never holds its partition, and only its caller fails", async () => {
		const isPoison = (updates: readonly SubjectRowChange[]) =>
			updates.some(
				(change) => change.op === "update" && change.id === "poison",
			);
		const fake = createGatedDb();
		fake.openGate();
		const landFlush = fake.db.flush;
		fake.db.flush = async (request) => {
			if (!isPoison(request.changes)) return landFlush(request);
			throw Object.assign(
				new Error(
					'duplicate key value violates unique constraint "usage_windows_pkey"',
				),
				{ errno: "23505" },
			);
		};
		const warnings: string[] = [];
		const committer = createCommitter({
			ctx: {
				db: fake.db,
				logger: { warn: (message) => warnings.push(message) },
			},
			config: { concurrency: 1, maxRowsPerFlush: 500, retry: noRetry },
		});
		const poison = record({ partition: 0, offset: 1n, commandId: "b" });
		poison.mutation.changes = poison.mutation.changes.map((change) => ({
			...change,
			id: "poison",
		}));

		const outcome = await committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [
				record({ partition: 0, offset: 0n, commandId: "a" }),
				poison,
				record({ partition: 0, offset: 2n, commandId: "c" }),
			],
		});

		// The bookmark moves past the poison record, so a replay after a restart never meets it again.
		expect(outcome.nextOffset).toBe(3n);
		expect(outcome.failure).toBeUndefined();
		expect(outcome.rejections?.map(({ record }) => record)).toEqual([poison]);
		expect(outcome.rejections?.[0]?.cause).toBeInstanceOf(
			FlushRecordRefusedError,
		);
		expect(warnings.some((message) => message.includes("skipped"))).toBe(true);
		await committer.drain();
	});

	test("a lock id another customer holds is rejected alone: nothing behind it waits, and only its bookmark lands", async () => {
		const insertsLock = (updates: readonly SubjectRowChange[]) =>
			updates.some(
				(change) => change.op === "insert" && change.table === "locks",
			);
		const fake = createGatedDb();
		fake.openGate();
		const landFlush = fake.db.flush;
		fake.db.flush = async (request) => {
			if (!insertsLock(request.changes)) return landFlush(request);
			await landFlush(request);
			throw Object.assign(
				new Error(
					'duplicate key value violates unique constraint "balance_locks_org_env_lock_id_key"',
				),
				{ errno: "23505" },
			);
		};
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 1, maxRowsPerFlush: 500, retry: noRetry },
		});
		const locked = record({ partition: 0, offset: 1n, commandId: "b" });
		locked.mutation = createTrackMutation({
			state: createState({ balance: 100 }),
			command: {
				...createTrackCommand({ value: 5, commandId: "b" }),
				lock: {
					id: "lck_1",
					lockId: "L1",
					expiresAt: 1_800_000_000_000,
					expiryAction: "confirm",
				},
			},
		});

		const outcome = await committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [
				record({ partition: 0, offset: 0n, commandId: "a" }),
				locked,
				record({ partition: 0, offset: 2n, commandId: "c" }),
			],
		});

		// Every record is settled: a and c landed, the locked one was refused and skipped.
		expect(outcome.nextOffset).toBe(3n);
		expect(outcome.failure).toBeUndefined();
		expect(outcome.rejections?.map(({ record }) => record)).toEqual([locked]);
		expect(outcome.rejections?.[0]?.cause).toBeInstanceOf(
			LockAlreadyExistsError,
		);
		// The skip carried no row changes, so neither the deduction nor the lock row reached Postgres.
		const lockAttempts = fake.transactions
			.map((transaction, index) =>
				insertsLock(transaction.updates) ? index : -1,
			)
			.filter((index) => index !== -1);
		const lastLockAttempt = lockAttempts[lockAttempts.length - 1] ?? -1;
		expect(fake.transactions[lastLockAttempt + 1]?.updates).toEqual([]);
		await committer.drain();
	});

	test("a transient failure is retried with backoff and lands; the retry is bounded", async () => {
		const fake = createGatedDb({ transientFailures: 2 });
		fake.openGate();
		const delays: number[] = [];
		const committer = createCommitter({
			ctx: {
				db: fake.db,
				sleep: async ({ delayMs }) => {
					delays.push(delayMs);
				},
			},
			config: {
				concurrency: 1,
				maxRowsPerFlush: 500,
				retry: { maxAttempts: 3, initialBackoffMs: 50, maxBackoffMs: 800 },
			},
		});
		const landed = await committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [record({ partition: 0, offset: 0n, commandId: "a" })],
		});
		expect(landed).toEqual({ nextOffset: 1n });
		expect(delays).toEqual([50, 200]);

		const stubborn = createGatedDb({ transientFailures: 100 });
		stubborn.openGate();
		const bounded = createCommitter({
			ctx: { db: stubborn.db, sleep: async () => {} },
			config: {
				concurrency: 1,
				maxRowsPerFlush: 500,
				retry: { maxAttempts: 2, initialBackoffMs: 1, maxBackoffMs: 1 },
			},
		});
		const outcome = await bounded.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [record({ partition: 0, offset: 0n, commandId: "a" })],
		});
		expect(outcome.nextOffset).toBe(0n);
		expect((outcome.failure?.cause as Error).message).toBe("connection reset");
		// Two attempts, then nothing smaller to try: a single-record call is not re-run.
		expect(stubborn.transactions).toHaveLength(2);
	});

	test("concurrency and the row cap bound what one flush carries", async () => {
		const fake = createGatedDb();
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 2, maxRowsPerFlush: 1, retry: noRetry },
		});
		const calls = [0, 1, 2].map((partition) =>
			committer.apply({
				topic,
				partition,
				expectedOffset: 0n,
				records: [
					record({ partition, offset: 0n, commandId: `p${partition}` }),
				],
			}),
		);
		expect(fake.transactions).toHaveLength(2);
		fake.release();
		await calls[0];
		await calls[1];
		await Promise.resolve();
		expect(fake.transactions).toHaveLength(3);
		fake.release();
		await calls[2];
		expect(
			fake.transactions.map((transaction) => transaction.partitions),
		).toEqual([[0], [1], [2]]);
		await committer.drain();
	});

	test("a live control moves the lanes between flushes, clamped to the pool-sized ceiling", async () => {
		const fake = createGatedDb();
		let concurrency: number | null = null;
		const committer = createCommitter({
			ctx: { db: fake.db, control: { read: () => ({ concurrency }) } },
			config: { concurrency: 3, maxRowsPerFlush: 1, retry: noRetry },
		});
		const applyAll = () =>
			[0, 1, 2, 3].map((partition) =>
				committer.apply({
					topic,
					partition,
					expectedOffset: 0n,
					records: [
						record({ partition, offset: 0n, commandId: `c${partition}` }),
					],
				}),
			);

		// null → the boot value: three lanes start at once.
		let calls = applyAll();
		expect(fake.transactions).toHaveLength(3);
		fake.openGate();
		await Promise.all(calls);
		await committer.drain();

		// 1 → one lane; 99 → clamped to the ceiling of 3.
		concurrency = 1;
		const before = fake.transactions.length;
		calls = applyAll();
		expect(fake.transactions.length - before).toBe(1);
		await Promise.all(calls);
		await committer.drain();
		concurrency = 99;
		const beforeClamp = fake.transactions.length;
		calls = applyAll();
		expect(fake.transactions.length - beforeClamp).toBe(3);
		await Promise.all(calls);
		await committer.drain();
	});
});
