import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

const getFirstSqlLiteral = ({ query }: { query: unknown }): string =>
	(
		query as {
			queryChunks: Array<{ value?: string[] }>;
		}
	).queryChunks[0]?.value?.join("") ?? "";

test("serializes each customer's Redis read through Postgres write window", async () => {
	const firstMayFinish = deferred();
	let releasePrevious = Promise.resolve();
	const events: string[] = [];

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: (query: unknown) => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			const waitForPrevious = releasePrevious;
			const releaseThis = deferred();
			releasePrevious = releaseThis.promise;
			let lockAcquired = false;
			const transaction = {
				execute: async (query: unknown) => {
					if (!getFirstSqlLiteral({ query }).startsWith("SELECT pg_advisory")) {
						return [];
					}
					if (!lockAcquired) {
						await waitForPrevious;
						lockAcquired = true;
					}
					return [];
				},
			};

			try {
				return await callback(transaction);
			} finally {
				releaseThis.resolve();
			}
		},
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};

	const first = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		callback: async () => {
			events.push("first:read");
			await firstMayFinish.promise;
			events.push("first:write");
		},
	});
	await Promise.resolve();
	await Promise.resolve();

	const second = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		callback: async () => {
			events.push("second:read");
			events.push("second:write");
		},
	});
	await Promise.resolve();
	await Promise.resolve();

	expect(events).toEqual(["first:read"]);
	firstMayFinish.resolve();
	await Promise.all([first, second]);
	expect(events).toEqual([
		"first:read",
		"first:write",
		"second:read",
		"second:write",
	]);
});

test("invalidates a cache cutover when the enclosing transaction fails to commit, then converges on retry", async () => {
	let databaseBalance = 500;
	let cacheBalance: number | null = 500;
	let failNextCommit = true;
	let invalidationCount = 0;

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			const balanceBeforeTransaction = databaseBalance;
			const result = await callback({ execute: async () => [] });

			if (failNextCommit) {
				failNextCommit = false;
				databaseBalance = balanceBeforeTransaction;
				throw new Error("commit failed after callback");
			}

			return result;
		},
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};
	const executeLifecycleCutover = () =>
		withCustomerBalanceSyncLock({
			ctx: ctx as never,
			customerId: "customer_commit_failure",
			internalCustomerId: "internal_customer_commit_failure",
			callback: async () => {
				databaseBalance -= 100;
				cacheBalance = databaseBalance;
			},
			onTransactionFailure: async () => {
				invalidationCount += 1;
				cacheBalance = null;
			},
		});

	await expect(executeLifecycleCutover()).rejects.toThrow(
		"commit failed after callback",
	);
	expect(databaseBalance).toBe(500);
	expect(cacheBalance).toBeNull();
	expect(invalidationCount).toBe(1);

	await executeLifecycleCutover();
	expect(databaseBalance).toBe(400);
	expect(cacheBalance).toBe(400);
	expect(invalidationCount).toBe(1);
});

test("serializes public and internal aliases on the canonical internal customer ID", async () => {
	const firstMayFinish = deferred();
	const firstStarted = deferred();
	const secondLockAttempted = deferred();
	const lockTails = new Map<string, Promise<void>>();
	const acquiredLockKeys: string[] = [];
	const events: string[] = [];

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				query: {
					customers: {
						findFirst: () => Promise<{
							id: string;
							internal_id: string;
						}>;
					};
				};
				execute: (query: unknown) => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			let releaseLock: (() => void) | undefined;
			const transaction = {
				query: {
					customers: {
						findFirst: async () => ({
							id: "public_customer_1",
							internal_id: "internal_customer_1",
						}),
					},
				},
				execute: async (query: unknown) => {
					if (!getFirstSqlLiteral({ query }).startsWith("SELECT pg_advisory")) {
						return [];
					}
					const lockKey = (
						query as { queryChunks: [unknown, string, ...unknown[]] }
					).queryChunks[1];
					acquiredLockKeys.push(lockKey);
					if (acquiredLockKeys.length === 2) secondLockAttempted.resolve();

					const waitForPrevious = lockTails.get(lockKey) ?? Promise.resolve();
					const releaseThis = deferred();
					lockTails.set(
						lockKey,
						waitForPrevious.then(() => releaseThis.promise),
					);
					await waitForPrevious;
					releaseLock = releaseThis.resolve;
					return [];
				},
			};

			try {
				return await callback(transaction);
			} finally {
				releaseLock?.();
			}
		},
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};

	const first = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "public_customer_1",
		callback: async () => {
			events.push("first:read");
			firstStarted.resolve();
			await firstMayFinish.promise;
			events.push("first:write");
		},
	});
	await firstStarted.promise;

	const second = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "internal_customer_1",
		callback: async () => {
			events.push("second:read");
			events.push("second:write");
		},
	});
	await secondLockAttempted.promise;

	expect(events).toEqual(["first:read"]);
	firstMayFinish.resolve();
	await Promise.all([first, second]);
	expect(events).toEqual([
		"first:read",
		"first:write",
		"second:read",
		"second:write",
	]);
	expect(new Set(acquiredLockKeys)).toEqual(
		new Set(["customer-balance-sync:org_1:sandbox:internal_customer_1"]),
	);
});

test("uses the internal ID for a customer whose public ID is null", async () => {
	let resolutionCount = 0;
	const acquiredLockKeys: string[] = [];
	const db = {
		transaction: async <T>(
			callback: (transaction: {
				query: {
					customers: {
						findFirst: () => Promise<{
							id: null;
							internal_id: string;
						}>;
					};
				};
				execute: (query: unknown) => Promise<unknown[]>;
			}) => Promise<T>,
		) =>
			callback({
				query: {
					customers: {
						findFirst: async () => {
							resolutionCount += 1;
							return {
								id: null,
								internal_id: "internal_customer_without_public_id",
							};
						},
					},
				},
				execute: async (query: unknown) => {
					if (!getFirstSqlLiteral({ query }).startsWith("SELECT pg_advisory")) {
						return [];
					}
					acquiredLockKeys.push(
						(query as { queryChunks: [unknown, string, ...unknown[]] })
							.queryChunks[1],
					);
					return [];
				},
			}),
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};

	await withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "internal_customer_without_public_id",
		callback: async () => undefined,
	});

	expect(resolutionCount).toBe(1);
	expect(acquiredLockKeys).toEqual([
		"customer-balance-sync:org_1:sandbox:internal_customer_without_public_id",
	]);
});

test("bounds advisory-lock acquisition with a transaction-local lock timeout", async () => {
	const executedQueries: unknown[] = [];
	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: (query: unknown) => Promise<unknown[]>;
			}) => Promise<T>,
		) =>
			callback({
				execute: async (query: unknown) => {
					executedQueries.push(query);
					return [];
				},
			}),
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};

	await withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		callback: async () => undefined,
	});

	const lockTimeoutSql = getFirstSqlLiteral({ query: executedQueries[0] });
	const advisoryLockSql = getFirstSqlLiteral({ query: executedQueries[1] });

	expect(lockTimeoutSql).toBe("SET LOCAL lock_timeout = 10000");
	expect(advisoryLockSql).toStartWith("SELECT pg_advisory_xact_lock");
});

test("propagates an advisory-lock timeout as a retryable sync failure", async () => {
	const lockTimeoutError = new Error("canceling statement due to lock timeout");
	let executeCount = 0;
	let callbackRan = false;
	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		) =>
			callback({
				execute: async () => {
					executeCount += 1;
					if (executeCount === 1) return [];
					throw lockTimeoutError;
				},
			}),
	};
	const ctx = {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		db,
	};

	await expect(
		withCustomerBalanceSyncLock({
			ctx: ctx as never,
			customerId: "customer_1",
			internalCustomerId: "internal_customer_1",
			callback: async () => {
				callbackRan = true;
			},
		}),
	).rejects.toThrow("canceling statement due to lock timeout");

	expect(callbackRan).toBe(false);
	expect(isTransientDbError({ error: lockTimeoutError })).toBe(true);
});
