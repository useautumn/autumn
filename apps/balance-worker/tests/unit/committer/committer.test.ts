import { describe, expect, test } from "bun:test";
import { LockAlreadyExistsError } from "@autumn/balance-engine";
import {
	FlushBookmarkConflictError,
	type SubjectRowChange,
	subjectRowIdOf,
} from "@autumn/postgres";
import { FlushRecordRefusedError } from "../../../src/committer/committerErrors.js";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import { SubjectStaleError } from "../../../src/processor/subject/subjectErrors.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createState,
	createTrackCommand,
	createTrackMutation,
} from "../../fixtures/mutations.js";

const topic = "autumn-metering";
const retry = {
	degradedAfterAttempts: 1,
	initialBackoffMs: 1,
	maxBackoffMs: 1,
};

/** A Postgres stand-in whose flushes wait on a gate, so they can be observed mid-flight. */
function createGatedDb({
	failWhen,
	staleIds = new Set<string>(),
	transientFailures = 0,
}: {
	failWhen?: (updates: readonly SubjectRowChange[]) => Error | null;
	/** Rows whose guard no longer matches: the flush rolls back and reports them unapplied. */
	staleIds?: Set<string>;
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
			const failure = failWhen?.(request.changes);
			if (failure) throw failure;
			return {
				applied: request.changes.map(
					(change) => !staleIds.has(subjectRowIdOf(change)),
				),
			};
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
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
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

	test("a record whose bookmark another worker moved is left behind: other partitions land, its own earlier records land", async () => {
		const fake = createGatedDb({
			failWhen: (updates) =>
				updates.some(
					(change) => change.op === "update" && change.id === "poison",
				)
					? new FlushBookmarkConflictError({ expected: 1, advanced: 0 })
					: null,
		});
		fake.openGate();
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
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
		expect(poisoned.failure?.cause).toBeInstanceOf(FlushBookmarkConflictError);
		expect(poisoned.rejections).toEqual([]);
		// Partition 0's batch (the lane was free, so it went alone) fails, then record a lands,
		// then the poison record fails alone and c is not attempted; partition 1 follows untouched.
		expect(
			fake.transactions.map((transaction) => transaction.partitions),
		).toEqual([[0], [0], [0], [1]]);
		await committer.drain();
	});

	test("a record Postgres refuses for any reason is skipped: it never holds its partition, and only its caller fails", async () => {
		const fake = createGatedDb({
			failWhen: (updates) =>
				updates.some(
					(change) => change.op === "update" && change.id === "poison",
				)
					? new Error("value too long for type character varying(64)")
					: null,
		});
		fake.openGate();
		const warnings: string[] = [];
		const errors: string[] = [];
		const committer = createCommitter({
			ctx: {
				db: fake.db,
				logger: {
					info() {},
					warn: (message) => warnings.push(message),
					error: (message) => errors.push(message),
				},
			},
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
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
		// A skip that is not a stale subject lost a write to a bug, so it is loud.
		expect(errors.some((message) => message.includes("skipped"))).toBe(true);
		expect(warnings.some((message) => message.includes("skipped"))).toBe(false);
		await committer.drain();
	});

	test("a stale subject is skipped and named to its caller, so it retries against a fresh load", async () => {
		const fake = createGatedDb({ staleIds: new Set(["poison"]) });
		fake.openGate();
		const warnings: string[] = [];
		const committer = createCommitter({
			ctx: {
				db: fake.db,
				logger: {
					info() {},
					warn: (message) => warnings.push(message),
					error() {},
				},
			},
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
		});
		const stale = record({ partition: 0, offset: 1n, commandId: "b" });
		stale.mutation.changes = stale.mutation.changes.map((change) => ({
			...change,
			id: "poison",
		}));

		const outcome = await committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [
				record({ partition: 0, offset: 0n, commandId: "a" }),
				stale,
				record({ partition: 0, offset: 2n, commandId: "c" }),
			],
		});

		expect(outcome.nextOffset).toBe(3n);
		expect(outcome.failure).toBeUndefined();
		expect(outcome.rejections?.map(({ record }) => record)).toEqual([stale]);
		const cause = outcome.rejections?.[0]?.cause;
		expect(cause).toBeInstanceOf(SubjectStaleError);
		expect((cause as SubjectStaleError).identity).toEqual(
			stale.mutation.identity,
		);
		// The skip carries no row changes: nothing of the stale decision reaches Postgres.
		expect(fake.transactions.at(-2)?.updates).toEqual([]);
		expect(warnings.some((message) => message.includes("underneath"))).toBe(
			true,
		);
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
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
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

	test("a transient failure is retried with capped backoff until Postgres answers; degraded is reported meanwhile", async () => {
		const fake = createGatedDb({ transientFailures: 6 });
		fake.openGate();
		const delays: number[] = [];
		const warnings: string[] = [];
		const infos: string[] = [];
		const committer = createCommitter({
			ctx: {
				db: fake.db,
				logger: {
					info: (message) => infos.push(message),
					warn: (message) => warnings.push(message),
					error() {},
				},
				sleep: async ({ delayMs }) => {
					delays.push(delayMs);
				},
			},
			config: {
				concurrency: 1,
				maxRowsPerFlush: 500,
				retry: {
					degradedAfterAttempts: 3,
					initialBackoffMs: 50,
					maxBackoffMs: 800,
				},
			},
		});
		const landed = await committer.apply({
			topic,
			partition: 0,
			expectedOffset: 0n,
			records: [record({ partition: 0, offset: 0n, commandId: "a" })],
		});

		expect(landed).toEqual({ nextOffset: 1n });
		expect(fake.transactions).toHaveLength(7);
		expect(delays).toEqual([50, 200, 800, 800, 800, 800]);
		// Reported at the threshold and every threshold after, then once when the store answers.
		expect(warnings.map((message) => message.slice(0, 40))).toEqual([
			"[committer] Postgres has refused 3 flush",
			"[committer] Postgres has refused 6 flush",
		]);
		expect(infos).toHaveLength(1);
		expect(infos[0]).toContain("after 7 attempts");
	});

	test("stopping the committer ends a wait on Postgres: the waiting call rejects, nothing is skipped or bookmarked", async () => {
		const stubborn = createGatedDb({ transientFailures: 100 });
		stubborn.openGate();
		const sleeping = Promise.withResolvers<void>();
		const committer = createCommitter({
			ctx: {
				db: stubborn.db,
				sleep: ({ signal }) =>
					new Promise((resolve) => {
						sleeping.resolve();
						signal.addEventListener("abort", () => resolve(), { once: true });
					}),
			},
			config: { concurrency: 1, maxRowsPerFlush: 500, retry },
		});
		// Caught up front: the queued call rejects synchronously inside stop().
		const settledName = (settled: Promise<unknown>) =>
			settled.then(
				() => "resolved",
				(cause: Error) => cause.name,
			);
		const waiting = settledName(
			committer.apply({
				topic,
				partition: 0,
				expectedOffset: 0n,
				records: [record({ partition: 0, offset: 0n, commandId: "a" })],
			}),
		);
		await sleeping.promise;
		const queued = settledName(
			committer.apply({
				topic,
				partition: 1,
				expectedOffset: 0n,
				records: [record({ partition: 1, offset: 0n, commandId: "b" })],
			}),
		);

		committer.stop();

		expect(await waiting).toBe("CommitterStoppedError");
		expect(await queued).toBe("CommitterStoppedError");
		expect(
			await settledName(
				committer.apply({
					topic,
					partition: 2,
					expectedOffset: 0n,
					records: [record({ partition: 2, offset: 0n, commandId: "c" })],
				}),
			),
		).toBe("CommitterStoppedError");
		// One attempt was in flight; the store never saw a skip or a bookmark for any of them.
		expect(stubborn.transactions).toHaveLength(1);
		expect(stubborn.transactions[0]?.updates).not.toEqual([]);
		await committer.drain();
	});

	test("concurrency and the row cap bound what one flush carries", async () => {
		const fake = createGatedDb();
		const committer = createCommitter({
			ctx: { db: fake.db },
			config: { concurrency: 2, maxRowsPerFlush: 1, retry },
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
			config: { concurrency: 3, maxRowsPerFlush: 1, retry },
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
