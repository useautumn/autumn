import { expect, test } from "bun:test";
import { EntInterval, type FullCusEntWithFullCusProduct } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import {
	type ResetPooledCustomerEntitlementsDependencies,
	resetPooledCustomerEntitlementsWithDependencies,
} from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

test("a delayed sync waits for the lazy pooled reset transaction", async () => {
	const lazyResetMayFinish = deferred();
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
			let advisoryLockAcquired = false;
			const transaction = {
				execute: async () => {
					if (!advisoryLockAcquired) {
						await waitForPrevious;
						advisoryLockAcquired = true;
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
		env: "sandbox",
		db,
	};
	const baseCustomerEntitlement = customerEntitlements.create({
		id: "cus_ent_pool",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 400,
		interval: EntInterval.Month,
		nextResetAt: 1,
	});
	const pooledCustomerEntitlement = {
		...baseCustomerEntitlement,
		customer_product_id: null,
		customer_product: null,
		entitlement: { ...baseCustomerEntitlement.entitlement, pooled: true },
	} as FullCusEntWithFullCusProduct;
	const dependencies: ResetPooledCustomerEntitlementsDependencies = {
		lockCustomer: async () => {
			events.push("lazy:customer-lock");
		},
		invalidateCachedSubject: async () => {
			events.push("lazy:capture");
		},
		resetCustomerEntitlement: async () => {
			events.push("lazy:read");
			await lazyResetMayFinish.promise;
			events.push("lazy:write");
			return null;
		},
	};

	const lazyReset = resetPooledCustomerEntitlementsWithDependencies({
		ctx: ctx as never,
		customerId: "customer_1",
		customerEntitlements: [pooledCustomerEntitlement],
		now: 2,
		dependencies,
	});
	await Promise.resolve();
	await Promise.resolve();

	const delayedSync = withCustomerBalanceSyncLock({
		ctx: ctx as never,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		callback: async () => {
			events.push("sync:read");
			events.push("sync:write");
		},
	});
	await Promise.resolve();
	await Promise.resolve();

	expect(events).toEqual(["lazy:customer-lock", "lazy:capture", "lazy:read"]);
	lazyResetMayFinish.resolve();
	await Promise.all([lazyReset, delayedSync]);
	expect(events).toEqual([
		"lazy:customer-lock",
		"lazy:capture",
		"lazy:read",
		"lazy:write",
		"sync:read",
		"sync:write",
	]);
});

test("a cache rebuild reuses its existing balance-sync transaction for a due pooled reset", async () => {
	const events: string[] = [];
	const balanceSyncDb = {
		execute: async () => [],
	};
	const ctx = {
		org: { id: "org_1" },
		env: "sandbox",
		db: {
			transaction: async () => {
				throw new Error("nested balance-sync transaction");
			},
		},
	};
	const baseCustomerEntitlement = customerEntitlements.create({
		id: "cus_ent_existing_lock",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 400,
		interval: EntInterval.Month,
		nextResetAt: 1,
	});
	const pooledCustomerEntitlement = {
		...baseCustomerEntitlement,
		customer_product_id: null,
		customer_product: null,
		entitlement: { ...baseCustomerEntitlement.entitlement, pooled: true },
	} as FullCusEntWithFullCusProduct;
	const dependencies: ResetPooledCustomerEntitlementsDependencies = {
		lockCustomer: async ({ db }) => {
			expect(db as unknown).toBe(balanceSyncDb);
			events.push("customer-lock");
		},
		invalidateCachedSubject: async ({ balanceSyncDb: receivedDb }) => {
			expect(receivedDb as unknown).toBe(balanceSyncDb);
			events.push("capture");
		},
		resetCustomerEntitlement: async ({ balanceSyncDb: receivedDb }) => {
			expect(receivedDb as unknown).toBe(balanceSyncDb);
			events.push("reset");
			return null;
		},
	};

	await resetPooledCustomerEntitlementsWithDependencies({
		ctx: ctx as never,
		customerId: "customer_existing_lock",
		customerEntitlements: [pooledCustomerEntitlement],
		now: 2,
		balanceSyncDb: balanceSyncDb as never,
		dependencies,
	});

	expect(events).toEqual(["customer-lock", "capture", "reset"]);
});

test("a stale due snapshot returns the authoritative reset state after another request wins", async () => {
	const transaction = {
		execute: async () => [],
	};
	const ctx = {
		org: { id: "org_1" },
		env: "sandbox",
		db: {
			transaction: async <T>(
				callback: (lockedDb: typeof transaction) => Promise<T>,
			) => callback(transaction),
		},
	};
	const baseCustomerEntitlement = customerEntitlements.create({
		id: "cus_ent_stale_pool",
		featureId: "messages",
		featureName: "Messages",
		allowance: 300,
		balance: 180,
		interval: EntInterval.Month,
		nextResetAt: 1000,
	});
	const pooledCustomerEntitlement = {
		...baseCustomerEntitlement,
		customer_product_id: null,
		customer_product: null,
		entitlement: { ...baseCustomerEntitlement.entitlement, pooled: true },
	} as FullCusEntWithFullCusProduct;
	const events: string[] = [];

	const results = await resetPooledCustomerEntitlementsWithDependencies({
		ctx: ctx as never,
		customerId: "customer_stale_pool",
		customerEntitlements: [pooledCustomerEntitlement],
		now: 2000,
		dependencies: {
			lockCustomer: async () => {},
			invalidateCachedSubject: async () => {},
			resetCustomerEntitlement: async () => {
				events.push("reset-lost-race");
				return null;
			},
			findCustomerEntitlementById: async ({ db }: { db: unknown }) => {
				expect(db as unknown).toBe(transaction);
				events.push("read-authoritative-state");
				return {
					...pooledCustomerEntitlement,
					balance: 300,
					adjustment: 300,
					next_reset_at: 3000,
				};
			},
		} as never,
	});

	expect(events).toEqual(["reset-lost-race", "read-authoritative-state"]);
	expect(results).toEqual([
		{
			customerEntitlementId: "cus_ent_stale_pool",
			featureId: "messages",
			resetAt: 1000,
			balance: 300,
			adjustment: 300,
			nextResetAt: 3000,
			applied: false,
		},
	]);
});
