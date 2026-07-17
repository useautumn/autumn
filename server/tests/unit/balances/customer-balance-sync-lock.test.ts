import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

test("serializes each customer's Redis read through Postgres write window", async () => {
	const firstMayFinish = deferred();
	let releasePrevious = Promise.resolve();
	const events: string[] = [];

	const db = {
		transaction: async <T>(
			callback: (transaction: {
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		) => {
			const waitForPrevious = releasePrevious;
			const releaseThis = deferred();
			releasePrevious = releaseThis.promise;
			let lockAcquired = false;
			const transaction = {
				execute: async () => {
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
					const lockKey = (
						query as { queryChunks: [unknown, string, ...unknown[]] }
					).queryChunks[1];
					acquiredLockKeys.push(lockKey);

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
			await firstMayFinish.promise;
			events.push("first:write");
		},
	});
	await Promise.resolve();
	await Promise.resolve();

	const second = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "internal_customer_1",
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
